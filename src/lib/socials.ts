/** Profile links, in the order the navbar icons and the about page's contact card show them. */
export type SocialIconName = 'email' | 'github' | 'bluesky' | 'orcid' | 'researchgate' | 'osf' | 'linkedin' | 'x';

type Profile = {
  email: string;
  socials: { github: string; bluesky: string; x: string; linkedin: string; orcid: string; researchgate: string; osf: string };
};

export function socialLinks(p: Profile): { icon: SocialIconName; label: string; href: string; text: string }[] {
  const s = p.socials;
  return [
    { icon: 'email', label: 'Email', href: `mailto:${p.email}`, text: p.email },
    { icon: 'github', label: 'GitHub', href: `https://github.com/${s.github}`, text: s.github },
    { icon: 'bluesky', label: 'Bluesky', href: `https://bsky.app/profile/${s.bluesky}`, text: `@${s.bluesky}` },
    { icon: 'orcid', label: 'ORCID', href: `https://orcid.org/${s.orcid}`, text: s.orcid },
    { icon: 'researchgate', label: 'ResearchGate', href: `https://www.researchgate.net/profile/${s.researchgate}`, text: 'ResearchGate' },
    { icon: 'osf', label: 'OSF', href: `https://osf.io/${s.osf}/`, text: `osf.io/${s.osf}` },
    { icon: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/in/${s.linkedin}`, text: 'LinkedIn' },
    { icon: 'x', label: 'X (Twitter)', href: `https://x.com/${s.x}`, text: `@${s.x}` },
  ];
}
