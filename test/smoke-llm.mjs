/**
 * Self-contained stand-in for the harness message constructors the gateway
 * imports at runtime. The published repository must run `npm test` without a
 * harness checkout, so this mirrors the constructor contract (fresh identity
 * plus a frozen snapshot) instead of resolving the real package from a local
 * install path.
 */
let counter = 0

export function ToolCallId(value) {
  return String(value)
}

export function createMessage(input) {
  counter += 1
  return Object.freeze({ ...input, id: `msg-test-${counter}` })
}

export function createUserMessage(input) {
  return createMessage({ ...input, role: 'user' })
}

export function createToolResultMessage(input) {
  return createMessage({
    role: 'tool',
    source: { kind: 'tool', callId: input.callId },
    toolCallId: input.callId,
    content: input.content,
    isError: input.isError,
  })
}
