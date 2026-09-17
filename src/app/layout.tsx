import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import '@mantine/notifications/styles.css'
import './globals.css'
import type { Metadata } from 'next'
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { theme } from '@/theme'

export const metadata: Metadata = {
  title: { default: 'assift', template: '%s | assift' },
  description:
    'assift（アシフト）はスマホだけでシフト表の作成・共有ができるシンプルな Web サービスです。',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ja" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="light">
          <ModalsProvider>
            <NuqsAdapter>
              {children}
              <Notifications position="top-right" />
            </NuqsAdapter>
          </ModalsProvider>
        </MantineProvider>
      </body>
    </html>
  )
}
