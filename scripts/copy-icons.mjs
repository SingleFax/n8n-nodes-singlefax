import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'assets', 'singlefax.svg')
const folders = ['SingleFax', 'SingleFaxReceived', 'SingleFaxDelivered']
for (const folder of folders) {
  const destDir = join(root, 'dist', 'nodes', folder)
  mkdirSync(destDir, { recursive: true })
  copyFileSync(src, join(destDir, 'singlefax.svg'))
}
