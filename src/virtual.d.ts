// Modules made at build time by scripts/parish-plugin.mjs.

declare module "virtual:parish-config" {
  const parish: Omit<import("./types.js").ParishConfig, "tiles">;
  export default parish;
}

declare module "virtual:parish-tiles" {
  const tiles: {
    basemap: string;
    style: string;
    providers: Record<
      string,
      Omit<import("./tiles/providers.js").TileProvider, "upstream" | "secret">
    >;
  };
  export default tiles;
}
