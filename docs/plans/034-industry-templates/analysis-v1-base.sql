-- 034 §3: analysis-v1.sql と analysis-v1-2.sql が共有する下ごしらえ（temp table）。単独では流さない（\ir で読む）。

-- 0. 下ごしらえ ----------------------------------------------------------------

-- 対象の店舗。運営（@assift.com）の店舗は除く
create temp table a_tenant as
select t.id as tenant_id,
       t.user_id,
       t.shift_cycle,
       t.created_at,
       normalize(coalesce(t.name, ''), nfkc) as name_n
  from tenants t
  join users u on u.id = t.user_id
 where u.email not ilike '%@assift.com';

-- 直近 1 年（と先の 2 か月）のアサイン数。自動アサインの一時 Task（staff_id が null）は数えない
create temp table a_pattern_use as
select s.pattern_id, count(*) as shifts
  from shifts s
 where s.staff_id is not null
   and s.date >= current_date - 365
   and s.date < current_date + 60
 group by s.pattern_id;

-- 使われている店舗: 直近 1 年に 30 コマ以上のアサインがあり、在籍スタッフが 1 人以上
create temp table a_active as
select a.*, st.staffs, pu.shifts
  from a_tenant a
  join (select p.tenant_id, sum(u.shifts) as shifts
          from patterns p
          join a_pattern_use u on u.pattern_id = p.id
         group by p.tenant_id) pu on pu.tenant_id = a.tenant_id
  join (select tenant_id, count(*) as staffs
          from staffs
         where not coalesce(disabled, false)
         group by tenant_id) st on st.tenant_id = a.tenant_id
 where pu.shifts >= 30;

-- 店舗名から業種を推定する。上から順に当てる（「ネットカフェ」を飲食に、「ホームセンター」を介護に入れないため）
create temp table a_industry as
select tenant_id,
       case
         when name_n ~* '(セブン|ローソン|ファミリーマート|ファミマ|ミニストップ|デイリーヤマザキ|ヤマザキ|ポプラ|セイコーマート|コンビニ|cvs)' then 'cvs'
         when name_n ~* '(美容|理容|サロン|salon|ヘア|hair|ネイル|nail|エステ|まつ|整体|整骨|接骨|鍼|マッサージ|バーバー|barber)' then 'beauty'
         when name_n ~* '(ネットカフェ|ネカフェ|まんが|漫画|カラオケ|ジム|gym|フィットネス|fitness|プール|スポーツ|ゴルフ|ボウリング|シネマ|映画|パチンコ|ゲーム|アミューズ|温泉|銭湯|サウナ)' then 'leisure'
         when name_n ~* '(病院|クリニック|医院|診療所|歯科|薬局|病棟|外来|手術|ナース)' then 'medical'
         when name_n ~* '(ホームセンター|スーパー|ドラッグ)' then 'retail'
         when name_n ~* '(介護|ケア|デイ|老人|特養|老健|グループホーム|ホーム|訪問|看護|福祉|施設|サ高住|多機能|ショート|障害|障がい|就労|ヘルパー|生活支援)' then 'care'
         when name_n ~* '(保育|こども|子ども|子供|幼稚|学童|児童|キッズ|kids|塾|学習|スクール|school|教室|学校|学園|園)' then 'nursery'
         when name_n ~* '(ホテル|hotel|旅館|民宿|ゲストハウス|ホステル|hostel)' then 'hotel'
         when name_n ~* '(食堂|カフェ|cafe|café|喫茶|珈琲|コーヒー|coffee|レストラン|restaurant|居酒屋|酒場|バル|ダイニング|dining|キッチン|kitchen|ラーメン|らーめん|拉麺|そば|蕎麦|うどん|寿司|鮨|すし|焼肉|焼鳥|焼き鳥|やきとり|串|食|ベーカリー|bakery|パン|弁当|ピザ|pizza|バーガー|burger|中華|料理|亭|厨房|bar|バー)' then 'food'
         when name_n ~* '(ストア|store|ショップ|shop|マート|mart|書店|本屋|アパレル|販売|売場|売り場)' then 'retail'
         when name_n ~* '(倉庫|物流|配送|配達|運送|工場|製造|新聞)' then 'logistics'
         when name_n ~* '(コール|オペレーター|事務|受付|オフィス|office)' then 'office'
         when name_n ~* '(警備|清掃|ビルメン)' then 'security'
         else 'unknown'
       end as industry
  from a_active;

-- 使われている店舗の勤務。名前・説明は NFKC にそろえる（半角カナ・全角英数の揺れ）
create temp table a_pat as
select p.id,
       p.tenant_id,
       p.kind,
       p.pair_pattern_id,
       normalize(trim(p.name), nfkc) as name_n,
       nullif(normalize(trim(coalesce(p.description, '')), nfkc), '') as desc_n,
       upper(coalesce(p.color_hex, '#FFFFFF')) as color,
       row_number() over (partition by p.tenant_id order by p.position nulls last, p.id) as ord,
       coalesce(u.shifts, 0) as shifts,
       coalesce(u.shifts, 0)::numeric / a.shifts as share,
       p.created_at,
       a.created_at as tenant_created_at
  from patterns p
  join a_active a on a.tenant_id = p.tenant_id
  left join a_pattern_use u on u.pattern_id = p.id;

create temp view a_industry_size as
select industry, count(*) as n from a_industry group by industry;

