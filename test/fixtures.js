// Sample raw Gamma API event objects used across tests.

export function rawEvents(nowIso = new Date().toISOString()) {
  return [
    {
      id: 1,
      slug: 'ukraine-ceasefire-2026',
      title: 'Ukraine ceasefire in 2026?',
      description: 'Will a formal ceasefire be reached?',
      volume: 5000,
      liquidity: 1200,
      createdAt: nowIso,
      startDate: nowIso,
      endDate: '2026-12-31T00:00:00Z',
      active: true,
      closed: false,
      tags: [{ label: 'Geopolitics', slug: 'geopolitics' }, { label: 'Ukraine' }],
      markets: [{ id: 11, volumeNum: 5000 }],
    },
    {
      id: 2,
      slug: 'small-market',
      title: 'A quiet geopolitics market',
      volume: 1200,
      liquidity: 300,
      createdAt: nowIso,
      tags: [{ slug: 'geopolitics' }],
      markets: [{ id: 21 }],
    },
    {
      id: 3,
      slug: 'string-volume',
      title: 'Volume as a string over threshold',
      volume: '3500.5',
      createdAt: '2020-01-01T00:00:00Z', // old
      tags: [{ slug: 'geopolitics' }],
    },
    {
      id: 4,
      slug: 'summed-volume',
      title: 'Event volume summed from child markets',
      // no event-level volume -> sum children
      createdAt: nowIso,
      tags: [{ slug: 'geopolitics' }],
      markets: [{ volumeNum: 2000 }, { volume: '600' }],
    },
    {
      // XSS-ish content to verify escaping
      id: 5,
      slug: 'xss',
      title: 'Danger <script>alert(1)</script> & "quotes"',
      volume: 10,
      createdAt: nowIso,
      tags: [],
    },
  ];
}
