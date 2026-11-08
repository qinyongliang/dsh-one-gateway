/**
 * Resolve hooks that stand in for the harness modules the real Loader injects,
 * so `npm test` runs without a harness checkout. The doubles keep only the
 * shapes lib/index.js touches at load time; behaviour under test is the
 * gateway's own translation layer.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@deepseek-ai/dsh-llm') {
    return { url: new URL('./smoke-llm.mjs', import.meta.url).href, shortCircuit: true }
  }
  if (specifier === '@deepseek-ai/schemastery') {
    return { url: new URL('./smoke-schemastery.mjs', import.meta.url).href, shortCircuit: true }
  }
  if (specifier === '@deepseek-ai/dsh-home-paths') {
    return { url: new URL('./smoke-home-paths.mjs', import.meta.url).href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
