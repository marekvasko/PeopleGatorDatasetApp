export function ArchiveIcon({
  type,
}: {
  type: "scans" | "people" | "search" | "arrow" | "flag" | "thumb" | "random";
}) {
  const paths = {
    scans: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="1.5" />
        <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
      </>
    ),
    people: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.5 21v-2.5a6.5 6.5 0 0 1 13 0V21" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6" />
        <path d="m15 15 5 5" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
    flag: (
      <>
        <path d="M6 21V4" />
        <path d="M6 5h10l-2 3 2 3H6" />
      </>
    ),
    thumb: (
      <>
        <path d="M8 10v11H4V10h4Z" />
        <path d="M8 19h8.2a2 2 0 0 0 1.9-1.4l1.6-5A2 2 0 0 0 17.8 10H14l.7-3.1A3.2 3.2 0 0 0 12 3l-1 4.1L8 11" />
      </>
    ),
    random: (
      <>
        <path d="M4 7h3c5 0 5 10 10 10h3" />
        <path d="m17 14 3 3-3 3" />
        <path d="M4 17h3c1.8 0 3-.9 4-2M14 9c.8-1.2 1.8-2 3-2h3" />
        <path d="m17 4 3 3-3 3" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
      {paths[type]}
    </svg>
  );
}

