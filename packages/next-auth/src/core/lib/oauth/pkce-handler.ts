import * as jwt from "../../../jwt"
import {
  generateRandomCodeVerifier,
  calculatePKCECodeChallenge,
} from "@panva/oauth4webapi"
import type { InternalOptions } from "src/lib/types"
import type { Cookie } from "../cookie"
import type { AuthorizationServer } from "@panva/oauth4webapi"

const PKCE_CODE_CHALLENGE_METHOD = "S256"
const PKCE_MAX_AGE = 60 * 15 // 15 minutes in seconds

/**
 * Returns `code_challenge` and `code_challenge_method`
 * and saves them in a cookie.
 */
export async function createPKCE(
  authorizationServer: AuthorizationServer,
  options: InternalOptions<"oauth">
): Promise<
  | undefined
  | {
      code_challenge: string
      code_challenge_method: "S256"
      cookie: Cookie
    }
> {
  const { cookies, logger, provider } = options
  const { code_challenge_methods_supported } = authorizationServer
  if (
    !provider.checks?.includes("pkce") ||
    code_challenge_methods_supported?.length === 0
  ) {
    // Provider does not support PKCE, return nothing.
    return
  }
  const code_verifier = generateRandomCodeVerifier()
  const code_challenge = await calculatePKCECodeChallenge(code_verifier)

  const expires = new Date()
  expires.setTime(expires.getTime() + PKCE_MAX_AGE * 1000)

  // Encrypt code_verifier and save it to an encrypted cookie
  const encryptedCodeVerifier = await jwt.encode({
    ...options.jwt,
    maxAge: PKCE_MAX_AGE,
    token: { code_verifier },
  })

  logger.debug("CREATE_PKCE_CHALLENGE_VERIFIER", {
    code_challenge,
    code_challenge_method: PKCE_CODE_CHALLENGE_METHOD,
    code_verifier,
    PKCE_MAX_AGE,
  })

  return {
    code_challenge,
    code_challenge_method: PKCE_CODE_CHALLENGE_METHOD,
    cookie: {
      name: cookies.pkceCodeVerifier.name,
      value: encryptedCodeVerifier,
      options: { ...cookies.pkceCodeVerifier.options, expires },
    },
  }
}

/**
 * Returns code_verifier if provider uses PKCE,
 * and clears the container cookie afterwards.
 */
export async function usePKCECodeVerifier(
  codeVerifier: string | undefined,
  authorizationServer: AuthorizationServer,
  options: InternalOptions<"oauth">
): Promise<{ codeVerifier: string; cookie: Cookie } | undefined> {
  const { cookies, provider } = options
  const { code_challenge_methods_supported } = authorizationServer

  if (
    !provider?.checks?.includes("pkce") ||
    !codeVerifier ||
    code_challenge_methods_supported?.length === 0
  ) {
    return
  }

  const pkce = (await jwt.decode({
    ...options.jwt,
    token: codeVerifier,
  })) as any

  return {
    codeVerifier: pkce?.code_verifier ?? undefined,
    cookie: {
      name: cookies.pkceCodeVerifier.name,
      value: "",
      options: { ...cookies.pkceCodeVerifier.options, maxAge: 0 },
    },
  }
}
