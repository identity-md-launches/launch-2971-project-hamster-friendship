# squeek.hamster: domain investigation

Checked 2026-11-05. The display name is implemented. No domain was registered, reserved, purchased, renamed or connected, and the current production URL was not changed.

## Exact requested name

`.hamster` is absent from [IANA's current delegated TLD list](https://data.iana.org/TLD/tlds-alpha-by-domain.txt). Consequently, `squeek.hamster` is not presently a registrable name in conventional public DNS; there is no standard registrar price or DNS record that can make it a public DNS website. This is an unavailable TLD, not evidence that somebody has already registered this particular name. An alternative-root/Web3 naming product would need separate verification of its registry, ownership, resolution and browser support; none was confirmed here.

IMD's [public documentation](https://imd.fun/docs/llms.txt) describes IPFS exports named under ENS, with labels limited to lowercase letters, digits and inner hyphens. Its [public site-label API](https://api.imd.fun/sites/by-label/squeek.hamster) returned `invalid_label` for `squeek.hamster`; [squeek-hamster](https://api.imd.fun/sites/by-label/squeek-hamster) returned `unknown_label` at the time checked. The latter is a point-in-time absence, not a reservation or approval to rename this project. The reviewed public docs/API provide no `.hamster` registration/custom-domain connection flow or price. They also say a continuation updates the existing site's name rather than creating another project. Do not interpret a label lookup as a hosting change.

There are therefore no honest IMD/DNS steps to connect the exact literal `squeek.hamster` today. Keep it as the brand while retaining the working address.

## Closest alternatives

| Alternative | Availability and ownership | Pricing and connection |
| --- | --- | --- |
| Existing `hamster-friendship-the-lost-alic.identitymd.eth` | Already this project's assigned site; retain it. | Uses the existing IMD handoff. No new domain purchase is needed to keep the existing name. Future service/renewal terms were not quoted. |
| A permitted IMD label such as `squeek-hamster` | Lookup was `unknown_label`; no alias/rename capability was confirmed for this existing project. | Ask IMD's site owner/operator about an alias to this same project. No extra label/domain price is published in the reviewed docs, so no price is promised. Do not open a duplicate project. |
| `squeek.hamster.eth` | Requires control of the parent `hamster.eth` and creation of its `squeek` subname. Neither ownership nor availability was established. | The parent owner sets subname terms; do not assume it is free. [ENS's protocol](https://ercs.ethereum.org/ERCS/erc-137) permits parent owners to create subnames. |
| An owned `.eth` name, e.g. `squeekhamster.eth` | Check the exact name in the [ENS App](https://app.ens.domains/) at registration time; not checked/reserved here. | Current [ENS v2 pricing](https://support.ens.domains/en/articles/15180000-pricing-fees-and-multi-year-discounts) lists a five-or-more-character base at $8/year, with network fees and term discounts. Older v1 references quote $5; use the actual selected registrar/network checkout, not an assumed ETH amount. |
| A conventional DNS name under an existing TLD | Check a chosen registrar; no `.com`/`.game` availability or ownership is claimed. | Registration/renewal and TLS/gateway charges depend on the provider. Obtain a quote. Do not invent a CNAME target for IMD. |

## Conditional connection steps for an owner-controlled ENS alternative

These attach another name to the **same reviewed export**, not a second game or backend. They are not instructions for the unsupported `.hamster` TLD.

1. Confirm control of the selected ENS name/subname. If unregistered, use the ENS App to check and register it; if a subname, have its parent owner create it under their own terms. Name registration is an owner action outside the game's connect/login controls.
2. Finish the critical backend checks first. Obtain the reviewed IPFS CID from this existing project's delivery; do not guess a future CID or republish an unverified build.
3. In the ENS App, open the controlled name, edit its records, and set its website/content hash to `ipfs://<reviewed CID>`. Follow [ENS's website record guide](https://support.ens.domains/en/articles/17452873-add-a-decentralised-website-to-your-name). Confirm that the saved record resolves through an ENS-capable browser/gateway.
4. Test the new name's HTTPS gateway URL at the actual static subpath. Check assets, metadata, wallet login domain/URI and the same original Supabase project. On the original site, flush any pending events before testing the other origin; browser Auth/queues are origin-specific. A real verified login on the new origin must reopen the same wallet profile; never copy a guest profile or secrets between origins.
5. Verify data, marketplace, lifetime ranking and mobile play on both addresses. Retain the original name and existing production URL until the new address is confirmed working. Only then let the owner decide any canonical-link change. No redirect is included in this delivery.

For a conventional DNS/IPFS alternative, [IPFS's website guide](https://docs.ipfs.tech/how-to/websites-on-ipfs/single-page-website/) explains hosting. A DNSLink TXT record at `_dnslink.<owned-domain>` can identify `/ipfs/<reviewed CID>`, but the chosen gateway/hosting service must also document its DNS target and provision HTTPS for that domain. DNSLink alone is not a TLS website. A CNAME cannot create a nonexistent top-level domain. No provider-specific target or fee was supplied or fabricated.
