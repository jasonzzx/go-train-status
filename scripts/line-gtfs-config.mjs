/**
 * GTFS extraction config for each GO rail line, keyed by line id.
 *
 * `id`           — our line id (also the gotransit service-update code and,
 *                  except Kitchener, the GTFS route_short_name).
 * `routeShortName` — GTFS route_short_name for the TRAIN route (route_type 2).
 * `busRoutes`    — optional GTFS route_short_names for parallel replacement
 *                  bus routes (route_type 3) whose trips should be folded in.
 * `busStopMap`   — for bus routes, maps GTFS bus stop_id → station code, since
 *                  buses stop at street-level stops near each GO station.
 *
 * Train stations, ordering, names and railsix slugs are all derived from the
 * GTFS feed at generation time — only the bus mapping needs hand-tuning.
 */
export const LINE_GTFS_CONFIG = {
  ST: {
    routeShortName: 'ST',
    busRoutes: ['71'],
    busStopMap: {
      '02300': 'UN', // Union Station Bus Terminal
      '00128': 'UI', // Unionville GO Bus
      '02141': 'UI', // Unionville GO Bus (secondary)
      '02144': 'UI', // YMCA Blvd @ Kennedy Rd (Unionville)
      '00124': 'CE', // Bullock Dr @ McCowan Rd (Centennial GO)
      '00125': 'CE', // Bullock Dr @ McCowan Rd (Centennial GO, NB)
      '00122': 'MR', // Main St N @ Station St (Markham GO)
      '00123': 'MR', // Main St N @ Ramona Blvd (Markham GO, NB)
      '00121': 'MJ', // Mount Joy GO Bus
      '02830': 'LI', // Old Elm GO Bus
      '08045': 'LI', // Old Elm GO Bus (NB)
    },
  },
  LW: { routeShortName: 'LW' },
  LE: { routeShortName: 'LE' },
  BR: { routeShortName: 'BR' },
  RH: { routeShortName: 'RH' },
  KI: { routeShortName: 'KI' },
  MI: { routeShortName: 'MI' },
};
