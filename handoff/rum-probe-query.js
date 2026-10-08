(async () => {
  const filter = { AND: [{ datetime_geq: '2026-10-07T00:00:00Z', datetime_leq: '2026-10-08T06:00:00Z' }, { bot: 0 }, { siteTag_in: ['c188626389c143ae9567e09d59f3bfb2'] }] };
  const q = `query T($accountTag: string, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject) { viewer { accounts(filter: {accountTag: $accountTag}) {
    total: rumPageloadEventsAdaptiveGroups(limit: 1, filter: $filter) { count sum { visits } avg { sampleInterval } }
    byDay: rumPageloadEventsAdaptiveGroups(limit: 100, filter: $filter, orderBy: [date_ASC]) { count sum { visits } dimensions { date } }
    byHour: rumPageloadEventsAdaptiveGroups(limit: 5, filter: $filter) { count dimensions { datetimeHour } }
    pages: rumPageloadEventsAdaptiveGroups(limit: 5, filter: $filter, orderBy: [count_DESC]) { count sum { visits } dimensions { requestPath } }
    refs: rumPageloadEventsAdaptiveGroups(limit: 5, filter: $filter, orderBy: [sum_visits_DESC]) { count sum { visits } dimensions { refererHost } }
    countries: rumPageloadEventsAdaptiveGroups(limit: 5, filter: $filter, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { countryName } }
    devices: rumPageloadEventsAdaptiveGroups(limit: 5, filter: $filter, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { deviceType } }
  } } }`;
  const r = await fetch('/api/v4/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q, variables: { accountTag: 'd6248b98239aff4bbe31dbb6d0c71a23', filter } }) });
  return (await r.text()).slice(0, 4000);
})()
