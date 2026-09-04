import { spawnSync } from "node:child_process"
import process from "node:process"
import { pathToFileURL } from "node:url"

/**
 * Publish once, but treat a concurrent publisher winning the immutable npm
 * version race as success after the registry confirms that version exists.
 */
export function publishWithRaceRecovery({
    packageName,
    packageVersion,
    publish,
    getLocalIntegrity,
    getPublishedIntegrity,
    log = console.log,
}) {
    const status = publish()
    if (status === 0) return { outcome: "published", status: 0 }

    const localIntegrity = getLocalIntegrity()
    const publishedIntegrity = getPublishedIntegrity()
    if (localIntegrity && publishedIntegrity === localIntegrity) {
        log(`${packageName}@${packageVersion} was published concurrently; nothing left to do.`)
        return { outcome: "already-published", status: 0 }
    }

    return { outcome: "failed", status }
}

function commandStatus(command, args, stdio) {
    const result = spawnSync(command, args, { stdio })
    if (result.error) {
        console.error(`${command} failed to start: ${result.error.message}`)
        return 1
    }
    return result.status ?? 1
}

function commandOutput(command, args) {
    const result = spawnSync(command, args, { encoding: "utf8" })
    if (result.error || result.status !== 0) return undefined
    return result.stdout.trim() || undefined
}

function localPackageIntegrity() {
    const output = commandOutput("npx", [
        "--yes",
        "--package",
        "npm@11",
        "npm",
        "pack",
        "--dry-run",
        "--json",
    ])
    if (!output) return undefined
    try {
        return JSON.parse(output)[0]?.integrity
    } catch {
        return undefined
    }
}

export function main(env = process.env) {
    const packageName = env.PACKAGE_NAME?.trim()
    const packageVersion = env.PACKAGE_VERSION?.trim()
    if (!packageName || !packageVersion) {
        console.error("PACKAGE_NAME and PACKAGE_VERSION are required")
        return 1
    }

    const result = publishWithRaceRecovery({
        packageName,
        packageVersion,
        publish: () =>
            commandStatus(
                "npx",
                [
                    "--yes",
                    "--package",
                    "npm@11",
                    "npm",
                    "publish",
                    "--access",
                    "public",
                    "--provenance",
                ],
                "inherit",
            ),
        getLocalIntegrity: localPackageIntegrity,
        getPublishedIntegrity: () =>
            commandOutput("npm", ["view", `${packageName}@${packageVersion}`, "dist.integrity"]),
    })

    if (result.outcome === "failed") {
        console.error(
            `npm publish failed and the registry does not contain the identical ${packageName}@${packageVersion} tarball`,
        )
    }
    return result.status
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined
if (invokedPath === import.meta.url) process.exitCode = main()
