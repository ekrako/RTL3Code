import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { HttpClient, HttpClientResponse } from "effect/http";

import * as NpmRelease from "./npmRelease.ts";

const releases = "https://github.com/ekrako/RTL3Code/releases";
const nightly = "0.1.12-nightly.20261117.1";

it.effect.each([
  { spec: "latest", path: "latest/download/release.json", version: "0.1.11" },
  { spec: "0.1.11", path: "download/v0.1.11/release.json", version: "0.1.11" },
  { spec: "nightly", path: `download/v${nightly}/release.json`, version: nightly },
])("reads $spec from this fork and caches migration compatibility metadata", (fixture) =>
  Effect.gen(function* () {
    const urls: string[] = [];
    const http = HttpClient.make((request) => {
      urls.push(request.url);
      const body = request.url.endsWith("nightly.json")
        ? { tag_name: `v${nightly}` }
        : { version: fixture.version, t3code: { databaseMigration: 42 } };
      return Effect.succeed(
        HttpClientResponse.fromWeb(request, new Response(JSON.stringify(body))),
      );
    });
    const service = yield* NpmRelease.make().pipe(
      Effect.provideService(HttpClient.HttpClient, http),
    );
    const expected = { version: fixture.version, databaseMigration: 42 };
    expect(yield* service.get({ spec: fixture.spec })).toEqual(expected);
    expect(yield* service.get({ spec: fixture.spec })).toEqual(expected);
    expect(urls).toEqual([
      ...(fixture.spec === "nightly" ? [`${releases}/download/update-feed/nightly.json`] : []),
      `${releases}/${fixture.path}`,
    ]);
  }),
);

it.effect.each([
  { spec: "latest", status: 404, body: "", missing: true },
  { spec: "latest", status: 503, body: "unavailable", missing: false },
  { spec: "latest", status: 200, body: "not JSON", missing: false },
  { spec: "0.1.11", status: 200, body: '{"version":"0.1.12"}', missing: false },
  { spec: "latest", status: 200, body: `{"version":"${nightly}"}`, missing: false },
  { spec: "nightly", status: 200, body: '{"tag_name":"../../evil"}', missing: false },
])("handles release metadata $status for $spec safely ($body)", (fixture) =>
  Effect.gen(function* () {
    const http = HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(request, new Response(fixture.body, { status: fixture.status })),
      ),
    );
    const service = yield* NpmRelease.make().pipe(
      Effect.provideService(HttpClient.HttpClient, http),
    );
    const result = yield* Effect.result(service.get({ spec: fixture.spec }));
    if (fixture.missing) expect(result).toEqual(Result.succeed(null));
    else expect(Result.isFailure(result)).toBe(true);
  }),
);
