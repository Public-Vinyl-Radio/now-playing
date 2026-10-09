const base = process.env.HA_BASE_URL;
const token = process.env.HA_TOKEN;
if (!base || !token || token.startsWith('op://')) {
  console.error('Run this inspection through op run with the Home Assistant configuration.');
  process.exit(1);
}
for (const entity of [process.env.HA_MEDIA_PLAYER_ENTITY_ID, process.env.HA_VINYL_SENSOR_ENTITY_ID]) {
  try {
    const response = await fetch(new URL(`/api/states/${encodeURIComponent(entity)}`, base), {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) { console.log(JSON.stringify({ entity, status: response.status })); continue; }
    const data = await response.json();
    const a = data.attributes ?? {};
    let artwork;
    try {
      if (typeof a.entity_picture !== 'string') throw new Error('No artwork');
      const url = new URL(a.entity_picture, base);
      artwork = { origin: url.origin, path: url.pathname, queryFields: [...url.searchParams.keys()] };
    } catch { /* Missing artwork is normal. */ }
    console.log(JSON.stringify({ entity, state: data.state, attributeNames: Object.keys(a), title: a.media_title, artist: a.media_artist, album: a.media_album_name, duration: a.media_duration, position: a.media_position, artwork }));
  } catch (error) {
    console.error(JSON.stringify({ entity, error: error.cause?.code ?? error.code ?? 'CONNECTION_FAILED' }));
  }
}
