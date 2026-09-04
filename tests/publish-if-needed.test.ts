import assert from "node:assert/strict"
import test from "node:test"
import { publishWithRaceRecovery } from "../scripts/publish-if-needed.mjs"

const identity = {
    packageName: "@p4r4d0xb0x/opencode-dcp",
    packageVersion: "4.0.1",
}

test("successful publish does not query the registry fallback", () => {
    let checks = 0
    const result = publishWithRaceRecovery({
        ...identity,
        publish: () => 0,
        getLocalIntegrity: () => {
            checks++
            return "sha512-local"
        },
        getPublishedIntegrity: () => {
            checks++
            return "sha512-published"
        },
    })

    assert.deepEqual(result, { outcome: "published", status: 0 })
    assert.equal(checks, 0)
})

test("concurrent publication turns an immutable-version rejection into success", () => {
    const messages: string[] = []
    const result = publishWithRaceRecovery({
        ...identity,
        publish: () => 1,
        getLocalIntegrity: () => "sha512-same",
        getPublishedIntegrity: () => "sha512-same",
        log: (message: string) => messages.push(message),
    })

    assert.deepEqual(result, { outcome: "already-published", status: 0 })
    assert.deepEqual(messages, [
        "@p4r4d0xb0x/opencode-dcp@4.0.1 was published concurrently; nothing left to do.",
    ])
})

test("a real publish failure preserves its non-zero status", () => {
    const result = publishWithRaceRecovery({
        ...identity,
        publish: () => 42,
        getLocalIntegrity: () => "sha512-local",
        getPublishedIntegrity: () => undefined,
    })

    assert.deepEqual(result, { outcome: "failed", status: 42 })
})

test("a different tarball at the same version remains a hard failure", () => {
    const result = publishWithRaceRecovery({
        ...identity,
        publish: () => 1,
        getLocalIntegrity: () => "sha512-local",
        getPublishedIntegrity: () => "sha512-other",
    })

    assert.deepEqual(result, { outcome: "failed", status: 1 })
})
