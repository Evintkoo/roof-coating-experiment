// Copyright (c) 2026 Torviello.
// The single owner of external-link attributes: a link that leaves the site
// opens in a new tab and never leaks the opener (F-03). Components spread the
// result onto their anchor instead of writing target/rel by hand.
export interface LinkAttrs {
  target?: "_blank";
  rel?: "noopener noreferrer";
}

export function linkAttrs(external?: boolean): LinkAttrs {
  return external ? { target: "_blank", rel: "noopener noreferrer" } : {};
}
