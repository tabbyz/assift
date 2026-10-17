import type { Announcement, AnnouncementBlock } from './content'

/**
 * 告知（030）のテキスト版と HTML 版を、同じ文面のデータから組む（030 §3-7・§5.6）。
 * 文言はここで足さない（見出しの記号・PDF のボタンの「（PDF）」のような飾りだけ）。
 */

/** テキスト版（030 §5.2）。行の途中で改行しない。節の前は 2 行あける */
export function renderAnnouncementText(a: Announcement): string {
  const parts: string[] = [
    ...a.intro,
    ['【要点】', ...a.summary.map((item) => `・${item}`)].join('\n'),
  ]
  const body = parts.join('\n\n')
  const sections = a.sections.map((section) =>
    [`■${section.heading}`, ...section.blocks.map(blockText)].join('\n\n')
  )
  const signature = ['――――――――――', ...a.signature].join('\n')
  return [body, ...sections, signature].join('\n\n\n') + '\n'
}

function blockText(block: AnnouncementBlock): string {
  switch (block.type) {
    case 'paragraph':
      return block.text
    case 'list':
      return block.items.map((item) => `・${item}`).join('\n')
    case 'subheading':
      return `［${block.text}］`
    case 'pdf':
      return `${block.label}（PDF）\n${block.url}`
    case 'lines':
      return block.lines.join('\n')
  }
}

/*
 * 色は Mantine の既定のパレットの値（アプリと同じ。src/theme.ts は主色 gray・ボタン dark）。
 * メールは Mantine の外なので hex を直書きする（lib/pdf/styles.ts と同じ扱い）
 */
const COLOR = {
  text: '#212529', // gray.9
  muted: '#495057', // gray.7（小さな文字。白地で 4.5:1 以上）
  border: '#dee2e6', // gray.3
  button: '#2e2e2e', // dark.6
  buttonText: '#ffffff',
} as const

const FONT = `-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", Meiryo, sans-serif`

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** 文の中の URL とメールアドレスをリンクにする（エスケープした後の文字列に掛ける。全角の括弧や空白で切れる） */
const LINK_PATTERN =
  /https:\/\/[A-Za-z0-9\-._~/?#=&%+]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

function linkify(escaped: string): string {
  return escaped.replace(LINK_PATTERN, (match) => {
    // エスケープの後なので、& は &amp; のまま href に入る（HTML の属性として正しい）
    const href = match.startsWith('https://') ? match : `mailto:${match}`
    return `<a href="${href}" style="color:${COLOR.text};text-decoration:underline;">${match}</a>`
  })
}

const inline = (text: string) => linkify(escapeHtml(text))

const P = `margin:0 0 16px;font-size:16px;line-height:1.7;color:${COLOR.text};`

function blockHtml(block: AnnouncementBlock): string {
  switch (block.type) {
    case 'paragraph':
      return `<p style="${P}${block.strong ? 'font-weight:bold;' : ''}">${inline(block.text)}</p>`
    case 'list':
      return `<ul style="margin:0 0 16px;padding-left:1.4em;">${block.items
        .map(
          (item) =>
            `<li style="margin:0 0 8px;font-size:16px;line-height:1.7;color:${COLOR.text};">${inline(item)}</li>`
        )
        .join('')}</ul>`
    case 'subheading':
      return `<h3 style="margin:24px 0 8px;font-size:16px;line-height:1.5;font-weight:bold;color:${COLOR.text};">${inline(block.text)}</h3>`
    case 'pdf':
      // 画像のボタンにしない。押せる高さ 44px 以上（上下 12px + 行の高さ）。下に URL も出す（030 §5.6）
      return [
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px;"><tr><td style="border-radius:4px;background:${COLOR.button};">`,
        `<a href="${escapeHtml(block.url)}" style="display:inline-block;padding:12px 20px;font-size:16px;line-height:1.4;font-weight:bold;color:${COLOR.buttonText};text-decoration:none;border-radius:4px;">${escapeHtml(block.label)}（PDF）</a>`,
        `</td></tr></table>`,
        `<p style="margin:0 0 16px;font-size:12px;line-height:1.6;color:${COLOR.muted};word-break:break-all;">${inline(block.url)}</p>`,
      ].join('')
    case 'lines':
      return `<p style="${P}">${block.lines.map(inline).join('<br>')}</p>`
  }
}

/** プレヘッダーの後ろに本文が一覧に漏れないよう、見えない文字で埋める */
const PREHEADER_PADDING = '&nbsp;&zwnj;'.repeat(60)

/** HTML 版（030 §5.6）。1 列・幅 600px まで・CSS は要素に直接・画像なし */
export function renderAnnouncementHtml(a: Announcement): string {
  const sections = a.sections
    .map(
      (section) =>
        `<h2 style="margin:32px 0 12px;font-size:18px;line-height:1.5;font-weight:bold;color:${COLOR.text};">${inline(section.heading)}</h2>` +
        section.blocks.map(blockHtml).join('')
    )
    .join('')
  const summary =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px;border:1px solid ${COLOR.border};border-radius:4px;"><tr><td style="padding:16px 20px;">` +
    `<p style="margin:0 0 8px;font-size:16px;line-height:1.5;font-weight:bold;color:${COLOR.text};">要点</p>` +
    `<ul style="margin:0;padding-left:1.4em;">${a.summary
      .map(
        (item) =>
          `<li style="margin:0 0 6px;font-size:16px;line-height:1.7;color:${COLOR.text};">${inline(item)}</li>`
      )
      .join('')}</ul>` +
    `</td></tr></table>`
  return [
    '<!DOCTYPE html>',
    '<html lang="ja">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    `<title>${escapeHtml(a.subject)}</title>`,
    '</head>',
    `<body style="margin:0;padding:0;background:#ffffff;">`,
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;">${escapeHtml(a.preheader)}${PREHEADER_PADDING}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;"><tr><td align="center" style="padding:24px 16px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:${escapeHtml(FONT)};"><tr><td style="text-align:left;">`,
    `<p style="margin:0 0 24px;font-size:20px;line-height:1.4;font-weight:bold;color:${COLOR.text};">assift</p>`,
    a.intro.map((text) => `<p style="${P}">${inline(text)}</p>`).join(''),
    summary,
    sections,
    `<hr style="margin:32px 0 16px;border:0;border-top:1px solid ${COLOR.border};">`,
    `<p style="margin:0;font-size:14px;line-height:1.7;color:${COLOR.muted};">${a.signature.map(inline).join('<br>')}</p>`,
    '</td></tr></table>',
    '</td></tr></table>',
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
