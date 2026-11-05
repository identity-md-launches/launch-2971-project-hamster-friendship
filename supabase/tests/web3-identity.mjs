// Auth fixture matching Supabase's provider.Claims serialization. It does not
// perform signature verification and is never imported by the application.
export function web3Identity(address, claims = {}) {
  return {
    sub: 'web3:ethereum:' + address,
    custom_claims: { address, chain: 'ethereum', network: '1', domain: 'forest.example', statement: 'Sign in to save.', ...claims },
    email_verified: false,
    phone_verified: false
  };
}
