import { describe, expect, it } from 'vitest'
import { ANNOUNCEMENT, PRIVACY_PDF_URL, TERMS_PDF_URL, type Announcement } from './content'
import { escapeHtml, linksIn, renderAnnouncementHtml, renderAnnouncementText } from './render'

const sample: Announcement = {
  subject: '件名',
  preheader: '一覧に出る 1 行',
  intro: ['書き出し'],
  summary: ['要点 1', '要点 2'],
  sections: [
    {
      heading: '1. 見出し',
      blocks: [
        { type: 'paragraph', text: '段落 <b>&', strong: true },
        { type: 'list', items: ['項目 a', '項目 b'] },
        { type: 'subheading', text: '小見出し' },
        { type: 'pdf', label: '利用規約', url: 'https://api.assift.com/x.pdf' },
        { type: 'lines', lines: ['support@assift.com', '2 行目'] },
      ],
    },
  ],
  signature: ['assift運営', 'https://assift.com'],
}

describe('renderAnnouncementText', () => {
  it('節の前を 2 行あけ、箇条書きは「・」、小見出しは［］、PDF は名前と URL の 2 行', () => {
    expect(renderAnnouncementText(sample)).toBe(
      [
        '書き出し',
        '',
        '【要点】',
        '・要点 1',
        '・要点 2',
        '',
        '',
        '■1. 見出し',
        '',
        '段落 <b>&',
        '',
        '・項目 a',
        '・項目 b',
        '',
        '［小見出し］',
        '',
        '利用規約（PDF）',
        'https://api.assift.com/x.pdf',
        '',
        'support@assift.com',
        '2 行目',
        '',
        '',
        '――――――――――',
        'assift運営',
        'https://assift.com',
        '',
      ].join('\n')
    )
  })
})

describe('renderAnnouncementHtml', () => {
  const html = renderAnnouncementHtml(sample)

  it('文をエスケープし、URL とメールアドレスをリンクにする', () => {
    expect(html).toContain('段落 &lt;b&gt;&amp;')
    expect(html).toContain('<a href="mailto:support@assift.com"')
    expect(html).toContain('<a href="https://assift.com"')
    expect(html).toContain('href="https://api.assift.com/x.pdf"')
    expect(html).toContain('利用規約（PDF）</a>')
  })

  it('プレヘッダーを隠して先頭に置く', () => {
    expect(html.indexOf('一覧に出る 1 行')).toBeLessThan(html.indexOf('書き出し'))
    expect(html).toContain('display:none')
  })

  it('URL の & は切らずにエスケープし、末尾の約物は URL に含めない', () => {
    const one = renderAnnouncementHtml({
      ...sample,
      intro: ['見る https://example.com/a?x=1&y=2. と (https://assift.com/terms) と a@b.co。'],
    })
    expect(one).toContain('href="https://example.com/a?x=1&amp;y=2"')
    expect(one).toContain('>https://example.com/a?x=1&amp;y=2</a>. と')
    expect(one).toContain('href="https://assift.com/terms"')
    expect(one).toContain('</a>) と')
    expect(one).toContain('href="mailto:a@b.co"')
  })

  it('escapeHtml は属性に入れても壊れない', () => {
    expect(escapeHtml(`"'<>&`)).toBe('&quot;&#39;&lt;&gt;&amp;')
  })
})

describe('ANNOUNCEMENT（本物の文面）', () => {
  const text = renderAnnouncementText(ANNOUNCEMENT)
  const html = renderAnnouncementHtml(ANNOUNCEMENT)

  it('HTML は 100 KB 未満・画像なし・計測なし（030 §5.6。Gmail は約 102 KB で折りたたむ）', () => {
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(100 * 1024)
    expect(html).not.toMatch(/<img|<style|<script|https?:\/\/(?!api\.assift\.com|assift\.com)/)
  })

  it('本文のリンクの行き先（変えたら確かめてここを直す）', () => {
    const all = [
      ...ANNOUNCEMENT.intro,
      ...ANNOUNCEMENT.summary,
      ...ANNOUNCEMENT.sections.flatMap((section) =>
        section.blocks.flatMap((block) => {
          if (block.type === 'list') return block.items
          if (block.type === 'lines') return block.lines
          if (block.type === 'pdf') return [block.url]
          return [block.text]
        })
      ),
      ...ANNOUNCEMENT.signature,
    ].flatMap(linksIn)
    expect([...new Set(all)].sort()).toEqual(
      [
        TERMS_PDF_URL,
        PRIVACY_PDF_URL,
        'https://assift.com/terms',
        'https://assift.com/privacy',
        'https://assift.com/users/edit',
        'https://assift.com',
        'mailto:support@assift.com',
      ].sort()
    )
  })

  it('PDF のリンクは 029 の公開バケット', () => {
    for (const url of [TERMS_PDF_URL, PRIVACY_PDF_URL]) {
      expect(text).toContain(url)
      expect(html).toContain(`href="${url}"`)
    }
  })

  it('テキスト版と HTML 版に同じ文言が入っている（文言の正は content.ts）', () => {
    const visible = html
      .replace(/<div style="display:none[^]*?<\/div>/, '')
      .replace(/<[^>]+>/g, '')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&amp;', '&')
    const sentences = [
      ...ANNOUNCEMENT.intro,
      ...ANNOUNCEMENT.summary,
      ...ANNOUNCEMENT.sections.flatMap((section) => [
        section.heading,
        ...section.blocks.flatMap((block) => {
          if (block.type === 'list') return block.items
          if (block.type === 'lines') return block.lines
          if (block.type === 'pdf') return [block.label, block.url]
          return [block.text]
        }),
      ]),
    ]
    for (const sentence of sentences) {
      expect(text).toContain(sentence)
      expect(visible).toContain(sentence)
    }
  })

  it('548 条の 4 の周知に要る項目が入っている（030 §4.1）', () => {
    for (const phrase of [
      '2026年10月30日から、新しい利用規約とプライバシーポリシーを適用します',
      '（第2条）',
      '（第4条）',
      '（第13条）',
      'メンテナンス開始までに退会できます',
      '有料プランをご契約中の方の料金は変わりません',
      'support@assift.com',
    ]) {
      expect(text).toContain(phrase)
    }
  })
})
