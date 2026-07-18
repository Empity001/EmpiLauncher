import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'

export async function listManagedFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listManagedFiles(root, absolutePath))
    } else if (entry.isFile()) {
      files.push(path.relative(root, absolutePath).split(path.sep).join('/'))
    }
  }

  return files.sort()
}

async function digest(filePath: string) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex')
}

async function filesMatch(source: string, destination: string) {
  try {
    const [sourceStat, destinationStat] = await Promise.all([
      stat(source),
      stat(destination),
    ])
    if (sourceStat.size !== destinationStat.size) return false
    return await digest(source) === await digest(destination)
  } catch {
    return false
  }
}

function managedDestination(root: string, relativePath: string) {
  const resolvedRoot = path.resolve(root)
  const destination = path.resolve(resolvedRoot, relativePath)
  if (destination !== resolvedRoot && !destination.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Ruta gestionada no valida: ${relativePath}`)
  }
  return destination
}

export async function syncManagedFiles(
  sourceRoot: string,
  destinationRoot: string,
  previouslyManaged: string[],
  onProgress: (file: string, completed: number, total: number) => void,
) {
  const sourceFiles = await listManagedFiles(sourceRoot)
  const obsoleteFiles = previouslyManaged.filter((file) => !sourceFiles.includes(file))
  const total = Math.max(sourceFiles.length + obsoleteFiles.length, 1)
  let completed = 0

  for (const relativePath of sourceFiles) {
    const source = path.join(sourceRoot, relativePath)
    const destination = managedDestination(destinationRoot, relativePath)
    if (!await filesMatch(source, destination)) {
      await mkdir(path.dirname(destination), { recursive: true })
      await copyFile(source, destination)
    }
    completed += 1
    onProgress(relativePath, completed, total)
  }

  for (const relativePath of obsoleteFiles) {
    await rm(managedDestination(destinationRoot, relativePath), { force: true })
    completed += 1
    onProgress(relativePath, completed, total)
  }

  if (completed === 0) onProgress('Sin archivos nuevos', 1, 1)
  return sourceFiles
}
