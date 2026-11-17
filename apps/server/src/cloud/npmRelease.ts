import {
  ServerNpmReleaseError,
  ServerNpmReleaseInput,
  type ServerNpmRelease,
} from "@t3tools/contracts";
import { CLI_RELEASES_PAGE_URL, npmReleaseDatabaseMigration } from "@t3tools/shared/cliRelease";
import * as Cache from "effect/Cache";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { FetchHttpClient, HttpClient } from "effect/http";

const Version = Schema.String.check(Schema.isPattern(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/));
const decodeManifest = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({ version: Version, t3code: Schema.optionalKey(Schema.Unknown) }),
  ),
);
const decodePointer = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Struct({ tag_name: Schema.String })),
);
const decodeInput = Schema.decodeUnknownEffect(ServerNpmReleaseInput);

// Keep the RPC contract for older clients; this fork publishes compatibility metadata on GitHub.
export class NpmRelease extends Context.Service<
  NpmRelease,
  {
    readonly get: (
      input: ServerNpmReleaseInput,
    ) => Effect.Effect<ServerNpmRelease | null, ServerNpmReleaseError>;
  }
>()("t3/cloud/npmRelease") {}

export const make = Effect.fn("NpmRelease.make")(function* () {
  const http = yield* HttpClient.HttpClient;
  const read = Effect.fn("NpmRelease.read")(function* (path: string) {
    return yield* Effect.gen(function* () {
      const response = yield* http.get(`${CLI_RELEASES_PAGE_URL}/${path}`);
      if (response.status === 404) return Option.none<string>();
      if (response.status < 200 || response.status >= 300) {
        return yield* new ServerNpmReleaseError({
          reason: "Could not read RTL3Code release metadata.",
        });
      }
      return Option.some(yield* response.text);
    }).pipe(
      Effect.timeout(Duration.seconds(15)),
      Effect.mapError(
        () => new ServerNpmReleaseError({ reason: "Could not read RTL3Code release metadata." }),
      ),
    );
  });
  const cache = yield* Cache.make({
    capacity: 32,
    timeToLive: Duration.minutes(1),
    lookup: Effect.fn("NpmRelease.lookup")(
      function* (spec: string) {
        let targetVersion = spec;
        let path =
          spec === "latest" ? "latest/download/release.json" : `download/v${spec}/release.json`;
        if (spec === "nightly") {
          const pointer = yield* read("download/update-feed/nightly.json");
          if (Option.isNone(pointer)) return null;
          const { tag_name } = yield* decodePointer(pointer.value);
          if (!/^v\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$/.test(tag_name)) {
            return yield* new ServerNpmReleaseError({
              reason: "Invalid RTL3Code nightly pointer.",
            });
          }
          targetVersion = tag_name.slice(1);
          path = `download/${tag_name}/release.json`;
        }
        const json = yield* read(path);
        if (Option.isNone(json)) return null;
        const manifest = yield* decodeManifest(json.value);
        const matches =
          spec === "latest"
            ? /^\d+\.\d+\.\d+$/.test(manifest.version)
            : manifest.version === targetVersion;
        if (!matches) {
          return yield* new ServerNpmReleaseError({
            reason: "RTL3Code returned mismatched release metadata.",
          });
        }
        const databaseMigration = npmReleaseDatabaseMigration(manifest);
        return {
          version: manifest.version,
          ...(databaseMigration === undefined ? {} : { databaseMigration }),
        };
      },
      Effect.mapError(
        () => new ServerNpmReleaseError({ reason: "Could not resolve RTL3Code release metadata." }),
      ),
    ),
  });
  return NpmRelease.of({
    get: Effect.fn("NpmRelease.get")(function* (input) {
      const { spec } = yield* decodeInput(input).pipe(
        Effect.mapError(
          () => new ServerNpmReleaseError({ reason: "Invalid release version or track." }),
        ),
      );
      return yield* Cache.get(cache, spec);
    }),
  });
});

export const layer = Layer.effect(NpmRelease, make()).pipe(Layer.provide(FetchHttpClient.layer));
