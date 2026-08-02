import { Hono } from "hono";

import { listPlaces } from "../store";

export const places = new Hono();

places.get("/", (c) => {
  const type = c.req.query("type");
  return c.json({
    places: listPlaces(type === "police" || type === "hospital" ? type : undefined),
  });
});
