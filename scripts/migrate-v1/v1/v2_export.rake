# frozen_string_literal: true

# v2 へのエクスポート（021 §5）。このファイルを v1 の `lib/tasks/` に写して流す:
#
#   bundle exec rails v2:export[/path/to/out,2026-10-25T01:00:00+09:00]   # → /path/to/out/<YYYYMMDD-HHMM>/*.jsonl, manifest.json, usage_records.csv
#
#   2 つ目の引数はダンプを取った時刻（`heroku pg:backups:info` の Started）。manifest の `dumped_at` に残す
#   （「この時刻以降の v1 の書き込みは移っていない」の根拠。`exported_at` は rake の開始時刻で、別物）
#
# - 本番の Heroku ではなく、ダンプを restore した手元の v1 で流す（§4）
# - Ruby 側は「YAML 列をモデルで復元して書き出す」だけ。移行する / しない・捨てる・直すの判断はすべて v2 の TS（§6.2）
# - 1 行 1 レコードの JSONL（UTF-8）。形は v2 の `src/lib/migration/v1Types.ts` と 1:1（§12-2）
# - 個人情報を含むので出力先はリポジトリの外（`~/v1-export/`）。pg_dump と JSONL はカットオーバーから 3 か月で消す（§10-8）
require 'json'
require 'csv'
require 'yaml'

namespace :v2 do
  desc 'v2 へのエクスポート（JSONL + manifest + usage_records.csv）'
  task :export, %i[out dumped_at] => :environment do |_t, args|
    out_root = args[:out].presence || File.expand_path('~/v1-export')
    dir = File.join(out_root, Time.now.strftime('%Y%m%d-%H%M'))
    FileUtils.mkdir_p(dir)

    exporter = V2Exporter.new(dir, dumped_at: args[:dumped_at].presence)
    exporter.run
    puts "exported to #{dir}"
  end
end

class V2Exporter
  BATCH = 1000

  # 文字数の上限（v2 の CHECK。003 §3.10）。超過の件数を manifest に出す
  LIMITS = { tenant_name: 20, staff_name: 10, pattern_name: 6, pattern_description: 10, event_note: 12 }.freeze

  # 種別ごとに必須の列（§7.8）
  RESTRICTION_REQUIRED = {
    'deny_pattern_pair' => %i[pattern1_id pattern2_id],
    'max_work_week' => %i[pattern1_id days],
    'max_work_consecutive' => %i[days],
    'sat_or_sun_dayoff' => [],
  }.freeze

  def initialize(dir, dumped_at: nil)
    @dir = dir
    @dumped_at = dumped_at
    @counts = {}
    @stats = Hash.new { |h, k| h[k] = {} }
  end

  def run
    started = Time.now.utc
    export_users
    export_tenants
    export_staffs
    export_patterns
    export_shifts
    export_required_nums
    export_restrictions
    export_events
    export_shares
    export_usage_records
    collect_stats
    write_manifest(started)
  end

  private

  # ---------------------------------------------------------------------------
  # 書き出し
  # ---------------------------------------------------------------------------

  def jsonl(table, scope)
    path = File.join(@dir, "#{table}.jsonl")
    count = 0
    File.open(path, 'w') do |f|
      scope.find_each(batch_size: BATCH) do |record|
        f.puts(JSON.generate(yield(record)))
        count += 1
      end
    end
    @counts[table] = count
    $stdout.puts "#{table}: #{count}"
  end

  # Time 以外（SQL で 'infinity' を入れた datetime は Float::INFINITY で返る）は nil にして件数を出す
  def ts(time)
    return nil if time.nil?
    return time.utc.iso8601(6) if time.respond_to?(:utc)

    bump(:timestamps, :not_time)
    nil
  end

  def date(d)
    d&.iso8601
  end

  def export_users
    password_is_email = 0
    jsonl('users', User.unscoped) do |u|
      # 代理承認の初期パスワード（メール）のままの人（§7.1）。bcrypt の検証 1 回 ≈ 0.2 秒。
      # bcrypt の形でないハッシュ（Devise 以外が書いた値）は false にして件数だけ出す（1 行で全体を止めない）
      is_email = password_is_email?(u)
      password_is_email += 1 if is_email
      {
        id: u.id,
        email: u.email,
        encrypted_password: u.encrypted_password,
        password_is_email: is_email,
        confirmed_at: ts(u.confirmed_at),
        invitation_accepted_at: ts(u.invitation_accepted_at),
        invitation_token: u.invitation_token,
        provider: u.provider,
        uid: u.uid,
        sign_in_count: u.sign_in_count,
        current_sign_in_at: ts(u.current_sign_in_at),
        locked_at: ts(u.locked_at),
        stripe_customer_id: u.stripe_customer_id,
        stripe_subscription_id: u.stripe_subscription_id,
        trial_end: ts(u.trial_end),
        max_staffs_count: u.max_staffs_count,
        created_at: ts(u.created_at),
        updated_at: ts(u.updated_at),
      }
    end
    @stats[:users][:password_is_email] = password_is_email
  end

  # `user.valid_password?` は使わない: devise_invitable が上書きしていて、招待未承認（`invitation_token` あり）の人には
  # nil を返す（JSON の null になり v2 の Zod が止まる）。Devise の本体と同じ比較を直接呼ぶ
  def password_is_email?(user)
    return false if user.encrypted_password.blank?

    Devise::Encryptor.compare(User, user.encrypted_password, user.email) == true
  rescue BCrypt::Errors::InvalidHash
    bump(:users, :invalid_password_hash)
    false
  end

  def export_tenants
    jsonl('tenants', Tenant.unscoped) do |t|
      {
        id: t.id,
        uuid: t.uuid,
        user_id: t.user_id,
        name: t.name,
        shift_cycle: t.shift_cycle, # enum の名前（month / half_month / two_week / week）
        start_of_week: t.start_of_week,
        created_at: ts(t.created_at),
        updated_at: ts(t.updated_at),
      }
    end
  end

  def export_staffs
    jsonl('staffs', Staff.unscoped) do |s|
      # YAML 列はモデルの属性として読む（NULL は [] / {} になる。§5.1・§13-3）
      {
        id: s.id,
        tenant_id: s.tenant_id,
        name: s.name,
        position: s.position,
        disabled: s.disabled,
        max_work_week: s.max_work_week,
        available_wdays: array_or_empty(yaml_attr(s, :available_wdays, :staffs, []), :staffs, :available_wdays),
        available_patterns: array_or_empty(yaml_attr(s, :available_patterns, :staffs, []), :staffs, :available_patterns),
        default_patterns: hash_or_empty(yaml_attr(s, :default_patterns, :staffs, {}), :staffs, :default_patterns),
        created_at: ts(s.created_at),
        updated_at: ts(s.updated_at),
      }
    end
  end

  def export_patterns
    types = Hash.new(0)
    string_values = 0
    jsonl('patterns', Pattern.unscoped) do |p|
      # json 列 + serialize Hash の二重エンコード（§5.1）。生の値の型を集計し、モデルの値を Hash に寄せる
      types[raw_json_type(p)] += 1
      nums = hash_or_empty(yaml_attr(p, :default_required_nums, :patterns, {}), :patterns, :default_required_nums)
      string_values += 1 if nums.values.any? { |v| v.is_a?(String) }
      {
        id: p.id,
        tenant_id: p.tenant_id,
        name: p.name,
        description: p.description,
        color_hex: p.color_hex,
        kind: p.kind, # enum の名前（workday / dayoff）
        pair_pattern_id: p.pair_pattern_id,
        position: p.position,
        default_required_nums: nums,
        created_at: ts(p.created_at),
        updated_at: ts(p.updated_at),
      }
    end
    @stats[:patterns][:default_required_nums_raw_types] = types
    @stats[:patterns][:default_required_nums_with_string_values] = string_values
  end

  def export_shifts
    jsonl('shifts', Shift.unscoped) do |s|
      {
        id: s.id,
        date: date(s.date),
        pattern_id: s.pattern_id,
        staff_id: s.staff_id,
        fixed: s.fixed,
        created_at: ts(s.created_at),
        updated_at: ts(s.updated_at),
      }
    end
  end

  def export_required_nums
    jsonl('required_nums', RequiredNum.unscoped) do |r|
      { id: r.id, date: date(r.date), pattern_id: r.pattern_id, num: r.num }
    end
  end

  def export_restrictions
    jsonl('restrictions', Restriction.unscoped) do |r|
      {
        id: r.id,
        tenant_id: r.tenant_id,
        kind: r.kind,
        days: r.days,
        pattern1_id: r.pattern1_id,
        pattern2_id: r.pattern2_id,
        position: r.position,
        created_at: ts(r.created_at),
        updated_at: ts(r.updated_at),
      }
    end
  end

  def export_events
    jsonl('events', Event.unscoped) do |e|
      {
        id: e.id,
        tenant_id: e.tenant_id,
        date: date(e.date),
        note: e.note,
        created_at: ts(e.created_at),
        updated_at: ts(e.updated_at),
      }
    end
  end

  def export_shares
    jsonl('shares', Share.unscoped) do |s|
      {
        id: s.id,
        tenant_id: s.tenant_id,
        code: s.code,
        start_date: date(s.start_date),
        end_date: date(s.end_date),
        created_at: ts(s.created_at),
      }
    end
  end

  # 保管用（名前を含まない。1 年残す。§10-8）
  def export_usage_records
    path = File.join(@dir, 'usage_records.csv')
    count = 0
    CSV.open(path, 'w') do |csv|
      csv << %w[user_id staffs_count created_at]
      UsageRecord.unscoped.find_each(batch_size: BATCH) do |u|
        csv << [u.user_id, u.staffs_count, ts(u.created_at)]
        count += 1
      end
    end
    @counts['usage_records'] = count
    $stdout.puts "usage_records: #{count}"
  end

  # ---------------------------------------------------------------------------
  # YAML 列
  # ---------------------------------------------------------------------------

  # 属性の読み取り。YAML 列は読む時点で投げうる（宣言と違う型 → SerializationTypeMismatch、許可外のクラス・壊れた YAML →
  # Psych::Exception）。1 行で全体を止めず、既定値にして件数と id を manifest に出す（§9.2: 直すのは YAML の読み方だけ）
  def yaml_attr(record, column, table, default)
    record.public_send(column)
  rescue ActiveRecord::SerializationTypeMismatch, Psych::Exception
    bump(table, :"#{column}_unreadable")
    (@stats[table][:"#{column}_unreadable_ids"] ||= []) << record.id
    default
  end

  # モデルの値を Hash に寄せる。String ならもう一段 YAML をほどく（§5.1）。それでも Hash でなければ {}
  def hash_or_empty(value, table, column)
    if value.is_a?(String)
      bump(table, :"#{column}_string_values")
      value = safe_yaml(value, table, column)
    end
    return value.to_hash.transform_keys(&:to_s) if value.respond_to?(:to_hash)

    bump(table, :"#{column}_not_hash") unless value.nil?
    {}
  end

  # Array 列も同じ（モデルが `---` で始まらない文字列をそのまま返した行）
  def array_or_empty(value, table, column)
    if value.is_a?(String)
      bump(table, :"#{column}_string_values")
      value = safe_yaml(value, table, column)
    end
    return value if value.is_a?(Array)

    bump(table, :"#{column}_not_array") unless value.nil?
    []
  end

  def safe_yaml(text, table, column)
    YAML.safe_load(text, permitted_classes: [ActiveSupport::HashWithIndifferentAccess, Symbol], aliases: true)
  rescue Psych::Exception
    bump(table, :"#{column}_unreadable")
    nil
  end

  # json 列の生の値（JSON の文字列）を parse して型を見る（§5.2-1）
  def raw_json_type(pattern)
    raw = pattern.read_attribute_before_type_cast(:default_required_nums)
    return 'nil' if raw.nil?

    parsed = raw.is_a?(String) ? JSON.parse(raw) : raw
    case parsed
    when Hash then 'Hash'
    when String then 'String'
    when nil then 'nil'
    else parsed.class.name
    end
  rescue JSON::ParserError, Psych::Exception
    'unparsable'
  end

  def bump(table, key)
    @stats[table][key] = (@stats[table][key] || 0) + 1
  end

  # ---------------------------------------------------------------------------
  # 集計（§5.2。判断はしない。v1 の実態を見るためのもの）
  # ---------------------------------------------------------------------------

  def collect_stats
    conn = ActiveRecord::Base.connection
    count = ->(sql) { conn.select_value(sql).to_i }

    # 2. staffs の YAML 列が NULL の件数
    @stats[:staffs][:null_columns] = {
      available_wdays: Staff.unscoped.where(available_wdays: nil).count,
      available_patterns: Staff.unscoped.where(available_patterns: nil).count,
      default_patterns: Staff.unscoped.where(default_patterns: nil).count,
    }

    # 3. shifts の (staff_id, date) 重複の組数・staff_id IS NULL
    @stats[:shifts][:duplicate_staff_date_groups] =
      count.call('select count(*) from (select staff_id, date from shifts where staff_id is not null group by staff_id, date having count(*) > 1) d')
    @stats[:shifts][:staff_id_null] = Shift.unscoped.where(staff_id: nil).count
    # FK が無いので、消えたスタッフや assign の to_i が入れた 0 を指す行がありうる（§7.6 の parent_missing）
    @stats[:shifts][:staff_missing] =
      count.call('select count(*) from shifts s where s.staff_id is not null and not exists (select 1 from staffs t where t.id = s.staff_id)')

    # 4. patterns.pair_pattern_id が自分自身・他店舗・存在しない id を指す件数
    @stats[:patterns][:pair_self] = count.call('select count(*) from patterns where pair_pattern_id = id')
    @stats[:patterns][:pair_other_tenant] =
      count.call('select count(*) from patterns p join patterns q on q.id = p.pair_pattern_id where q.tenant_id is distinct from p.tenant_id')
    @stats[:patterns][:pair_missing] =
      count.call('select count(*) from patterns p where p.pair_pattern_id is not null and not exists (select 1 from patterns q where q.id = p.pair_pattern_id)')

    # 5. users の未確認の内訳
    unconfirmed = User.unscoped.where(confirmed_at: nil)
    @stats[:users][:unconfirmed] = {
      total: unconfirmed.count,
      invitation_pending: unconfirmed.where.not(invitation_token: nil).count,
      invitation_accepted: unconfirmed.where(invitation_token: nil).where.not(invitation_accepted_at: nil).count,
      with_sign_ins: unconfirmed.where('sign_in_count > 0').count,
    }

    # 6. / 11. Google の人
    google = User.unscoped.where(provider: 'google_oauth2')
    @stats[:users][:google] = google.count
    @stats[:users][:google_without_uid] = google.where("uid is null or uid = ''").count
    @stats[:users][:google_signed_in_within_90_days] = google.where('current_sign_in_at >= ?', 90.days.ago).count

    # 7. 文字数超過（char_length = コードポイント）
    @stats[:lengths] = {
      tenant_name: count.call("select count(*) from tenants where char_length(trim(name)) > #{LIMITS[:tenant_name]}"),
      staff_name: count.call("select count(*) from staffs where char_length(trim(name)) > #{LIMITS[:staff_name]}"),
      pattern_name: count.call("select count(*) from patterns where char_length(trim(name)) > #{LIMITS[:pattern_name]}"),
      pattern_description: count.call("select count(*) from patterns where char_length(trim(description)) > #{LIMITS[:pattern_description]}"),
      event_note: count.call("select count(*) from events where char_length(trim(note)) > #{LIMITS[:event_note]}"),
    }

    # 8. stripe_customer_id を複数のユーザーが持つ組（password_is_email は export_users で数えた）
    @stats[:users][:shared_stripe_customer_groups] =
      count.call("select count(*) from (select stripe_customer_id from users where stripe_customer_id is not null and stripe_customer_id <> '' group by stripe_customer_id having count(*) > 1) d")

    # 9. restrictions のうち種別に必要な列が無い行
    missing = Hash.new(0)
    unknown = 0
    Restriction.unscoped.find_each(batch_size: BATCH) do |r|
      required = RESTRICTION_REQUIRED[r.kind]
      if required.nil?
        unknown += 1
      elsif required.any? { |col| r.public_send(col).nil? }
        missing[r.kind] += 1
      end
    end
    @stats[:restrictions][:missing_required_columns] = missing
    @stats[:restrictions][:unknown_kind] = unknown

    # 10. 範囲外・親が NULL・重複
    @stats[:required_nums] = {
      num_over_smallint: RequiredNum.unscoped.where('num > 32767').count,
      num_negative: RequiredNum.unscoped.where('num < 0').count,
      date_null: RequiredNum.unscoped.where(date: nil).count,
    }
    @stats[:parent_null] = {
      'tenants.user_id' => Tenant.unscoped.where(user_id: nil).count,
      'staffs.tenant_id' => Staff.unscoped.where(tenant_id: nil).count,
      'patterns.tenant_id' => Pattern.unscoped.where(tenant_id: nil).count,
      'restrictions.tenant_id' => Restriction.unscoped.where(tenant_id: nil).count,
      'events.tenant_id' => Event.unscoped.where(tenant_id: nil).count,
      'shares.tenant_id' => Share.unscoped.where(tenant_id: nil).count,
      'required_nums.pattern_id' => RequiredNum.unscoped.where(pattern_id: nil).count,
      'shifts.pattern_id' => Shift.unscoped.where(pattern_id: nil).count,
    }
    @stats[:shares][:duplicate_code_groups] =
      count.call('select count(*) from (select code from shares group by code having count(*) > 1) d')

    # 旧 URL の 308 は 22 文字のトークンだけを見る（v2 の lib/tenants/legacyUrl.ts）
    @stats[:tenants][:uuid_not_22_chars] = count.call("select count(*) from tenants where uuid !~ '^[A-Za-z0-9_-]{22}$'")

    # 12. スタッフ 0 人の店舗のうち、勤務パターン・制約・必要人数を持つ店舗
    @stats[:tenants][:no_staff_with_data] = count.call(<<~SQL)
      select count(*) from tenants t
       where not exists (select 1 from staffs s where s.tenant_id = t.id)
         and (exists (select 1 from patterns p where p.tenant_id = t.id)
           or exists (select 1 from restrictions r where r.tenant_id = t.id)
           or exists (select 1 from required_nums rn join patterns p on p.id = rn.pattern_id where p.tenant_id = t.id))
    SQL

    # 13. 上限 1000 超・空のパスワード
    @stats[:users][:max_staffs_count_over_1000] = User.unscoped.where('max_staffs_count > 1000').count
    empty = User.unscoped.where(encrypted_password: '')
    @stats[:users][:empty_password] = {
      total: empty.count,
      confirmed_with_sign_ins: empty.where.not(confirmed_at: nil).where('sign_in_count > 0').count,
      confirmed_without_sign_ins: empty.where.not(confirmed_at: nil).where(sign_in_count: 0).count,
      unconfirmed_with_sign_ins: empty.where(confirmed_at: nil).where('sign_in_count > 0').count,
      unconfirmed_without_sign_ins: empty.where(confirmed_at: nil).where(sign_in_count: 0).count,
    }
  end

  def write_manifest(started)
    manifest = {
      exported_at: started.iso8601(6),
      dumped_at: @dumped_at,
      v1_commit: (`git rev-parse HEAD`.strip rescue ''),
      rails_env: Rails.env,
      counts: @counts,
      stats: @stats,
    }
    File.write(File.join(@dir, 'manifest.json'), JSON.pretty_generate(manifest))
  end
end
