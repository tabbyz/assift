import { generateText } from 'ai'

async function main() {
  const { text } = await generateText({
    model: 'openai/gpt-5.5',
    prompt: 'Invent a new holiday and describe its traditions.',
  })

  console.log(text)
}

main()
