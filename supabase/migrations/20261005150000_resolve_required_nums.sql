-- 015: 必要人数を「読むときに解決する」形に移す（データの移行。スキーマは変えない）。
--
-- これまでの `required_nums` は「デフォルト人数をセット」で期間ぶん焼き付けた行を持っていた。
-- これからは **この日だけ変えた上書きだけ**を持ち、行が無い組み合わせは
-- `patterns.default_required_nums`（基本の人数）に落ちる。
-- そこで、焼き付けられたままの行（= その日の基本の人数と同じ値の行）を消す。
--
-- 祝日の扱い:
--   祝日かどうかはアプリ側（@holiday-jp/holiday_jp）でしか分からないので、SQL では曜日だけで引く。
--   焼き付けは祝日に `holiday` の値（無ければ 0）を入れていたので、祝日の行がここに引っかかるのは
--   「`holiday` と その曜日の値が同じ」ときだけ。そのときは消しても解決後の数が変わらない。
--   `holiday` が無い店の祝日（焼き付けは 0）が消えると「0 人」から「未設定」に変わるが、
--   どちらも枠が無い点は同じで、表では `n/0` が `n/—` になるだけ。
--
-- 残った行は「基本と同じ値の上書き」として扱われる（表示は変わらず、ユーザーが「基本に戻す」で消せる）。
delete from public.required_nums rn
using public.patterns p
where rn.pattern_id = p.id
  and rn.num = coalesce(
    (p.default_required_nums ->> extract(dow from rn.date)::int::text)::int,
    0
  );
