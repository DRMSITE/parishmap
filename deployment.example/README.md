# Deployment folder

Everything particular to one council lives in `deployment/`, which is git-ignored in the
public repository so that one council's details never end up in another's copy. To start, copy this folder:

```bash
cp -r deployment.example deployment
```

- `parish.config.js` holds the council's name, where the map opens and the area it covers.
- `boundary.geojson` (optional) is the council's boundary as one GeoJSON `Polygon`, drawn as
  a dotted outline. Without the file there is simply no outline. The one here is a made-up
  example, so replace it or delete it.

If `deployment/` does not exist, the app, the tests and the build use this example folder, which is why a fresh clone builds at all.

A council that forks the repository can commit its own `deployment/` to a private fork. It is worth keeping that fork private, as the folder will hold your boundary and your settings.
