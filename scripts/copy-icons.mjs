import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconNames = ['singlefax.svg', 'singlefax.dark.svg']
const targets = [
  join(root, 'dist', 'credentials'),
  ...['SingleFax', 'SingleFaxReceived', 'SingleFaxDelivered'].map((folder) => join(root, 'dist', 'nodes', folder)),
]
for (const destDir of targets) {
  mkdirSync(destDir, { recursive: true })
  for (const name of iconNames) {
    copyFileSync(join(root, 'assets', name), join(destDir, name))
  }
}
