/**
 * `.github/actions/setup-aztec/install.sh` runs only bytes the repo pins: downloads by SHA-256, the
 * CLI's npm tree by its committed lockfile's integrity hashes.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..", "..")
const DIR = join(ROOT, ".github/actions/setup-aztec")
const read = (path: string) => readFileSync(join(ROOT, path), "utf8")

interface LockEntry {
  resolved?: string
  integrity?: string
  inBundle?: boolean
  link?: boolean
  dependencies?: Record<string, string>
}
interface Lockfile {
  packages: Record<string, LockEntry>
}

/**
 * Packages `npm ci` would take from anywhere but a registry tarball with a sha512 to check it against.
 * A bundled package arrives inside its parent's checked tarball; a link is a local directory.
 */
function unhashedSources(lock: Lockfile): string[] {
  return Object.entries(lock.packages)
    .filter(([path, entry]) => path !== "" && !entry.inBundle)
    .filter(([, entry]) => !entry.resolved?.startsWith("https://registry.npmjs.org/") || !entry.integrity?.startsWith("sha512-"))
    .map(([path]) => path)
}

/** Lines that fetch Foundry or an Aztec installer outside install.sh's pins. */
function ownInstallers(script: string): string[] {
  return script.split("\n").filter((line) => /foundry\.paradigm\.xyz|foundryup|install\.aztec(-labs)?\.(network|com)/.test(line))
}

const aztecVersion: string = JSON.parse(read("apps/extension/package.json")).dependencies["@aztec-labs/aztec.js"]
const lock: Lockfile = JSON.parse(readFileSync(join(DIR, "cli/package-lock.json"), "utf8"))

describe("the CLI's npm tree", () => {
  test("cli/package.json and its lockfile pin both CLI packages at the extension's Aztec version", () => {
    const expected = { "@aztec-labs/aztec": aztecVersion, "@aztec-labs/cli-wallet": aztecVersion }
    expect(JSON.parse(readFileSync(join(DIR, "cli/package.json"), "utf8")).dependencies).toEqual(expected)
    expect(lock.packages[""].dependencies).toEqual(expected)
  })

  test("every locked package is a registry tarball with a sha512", () => {
    expect(Object.keys(lock.packages).length).toBeGreaterThan(1000)
    expect(unhashedSources(lock)).toEqual([])
  })

  test.each([
    ["a git source", { resolved: "git+https://github.com/example/pkg.git#0123456" }],
    ["a file source", { resolved: "file:../vendor/pkg.tgz" }],
    ["no integrity", { integrity: undefined }],
    ["a linked directory", { link: true, resolved: "../vendor/pkg", integrity: undefined }],
  ])("a lockfile copy with %s is refused", (_, change) => {
    const target = "node_modules/@adraffy/ens-normalize"
    const copy: Lockfile = structuredClone(lock)
    copy.packages[target] = { ...copy.packages[target], ...change }
    expect(unhashedSources(copy)).toEqual([target])
  })
})

describe("installer-pins.sha256", () => {
  const pins = readFileSync(join(DIR, "installer-pins.sha256"), "utf8")
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))

  test("every line is one SHA-256 and one path", () => {
    expect(pins.filter((line) => !/^[0-9a-f]{64} {2}\S+$/.test(line))).toEqual([])
  })

  test.each([
    ["the installer", new RegExp(`^${aztecVersion.replaceAll(".", "\\.")}/install$`)],
    ["its versions manifest", new RegExp(`^${aztecVersion.replaceAll(".", "\\.")}/versions$`)],
    ["the noir tarball", /^noir\/[^/]+\/noir-x86_64-unknown-linux-gnu\.tar\.gz$/],
    ["the Foundry tarball", /^foundry\/([^/]+)\/foundry_v\1_linux_amd64\.tar\.gz$/],
  ])("pins %s exactly once", (_, path) => {
    expect(pins.filter((line) => path.test(line.split("  ")[1]))).toHaveLength(1)
  })
})

describe("the callers", () => {
  const callers = {
    ".github/actions/setup-aztec/action.yml": 'bash "$GITHUB_ACTION_PATH/install.sh"',
    "apps/extension/scripts/e2e/docker-ci-like.sh": 'bash "$SETUP_AZTEC/install.sh"',
  }

  test.each(Object.entries(callers))("%s installs through install.sh and fetches no installer itself", (path, call) => {
    const script = read(path)
    expect(script).toContain(call)
    expect(ownInstallers(script)).toEqual([])
  })

  test("install.sh installs the npm tree from the lockfile with install scripts off", () => {
    expect(read(".github/actions/setup-aztec/install.sh")).toMatch(/^\s*npm ci [^\n]*--ignore-scripts/m)
  })

  test("a caller that pipes Foundry's installer again is refused", () => {
    const script = `${read("apps/extension/scripts/e2e/docker-ci-like.sh")}\ncurl -L https://foundry.paradigm.xyz | bash\n`
    expect(ownInstallers(script)).toHaveLength(1)
  })
})
