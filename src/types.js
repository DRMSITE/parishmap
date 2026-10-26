// Shared JSDoc typedefs. This file has no runtime code: import the types with
// `import("./types.js").GeoRecord` (or `@typedef {import(...)}`) where needed.

/**
 * A GeoJSON position: [longitude, latitude] (note: the reverse of Leaflet's order).
 * @typedef {[number, number]} Position
 */

/**
 * The GeoJSON geometries a record may carry.
 * @typedef {{ type: "Point", coordinates: Position }
 *   | { type: "LineString", coordinates: Position[] }
 *   | { type: "Polygon", coordinates: Position[][] }
 *   | { type: "MultiPolygon", coordinates: Position[][][] }} GeoJSONGeometry
 */

/**
 * A piece of user data attached to a position or shape. `data` is deliberately opaque
 * so an application can attach whatever it likes without changing this shape.
 * @template [T=Record<string, unknown>]
 * @typedef {object} GeoRecord
 * @property {string} id Stable identifier, assigned by the data source.
 * @property {number} lat Latitude in degrees, -90 to 90. For a record with `geometry`
 *   this is its representative point, set by the data source.
 * @property {number} lng Longitude in degrees, -180 to 180 (see `lat`).
 * @property {GeoJSONGeometry} [geometry] A point, line or area. Absent on plain points,
 *   which are described by `lat` and `lng` alone.
 * @property {string} [category] Optional grouping, usable for flags and filtering.
 * @property {T} data Application-defined payload.
 * @property {string} [createdBy] User id of the author, set by the back end.
 * @property {string} [createdByEmail] Author's email, set by the back end.
 * @property {string} createdAt ISO 8601 timestamp.
 * @property {string} updatedAt ISO 8601 timestamp.
 */

/**
 * The fields a caller supplies when creating a record. When `geometry` is given,
 * `lat` and `lng` are overwritten with its representative point.
 * @template [T=Record<string, unknown>]
 * @typedef {Pick<GeoRecord<T>, "lat" | "lng" | "data"> & { category?: string, geometry?: GeoJSONGeometry }} GeoRecordInput
 */

/**
 * @typedef {object} GeoQuery
 * @property {string} [category] Only records in this category.
 * @property {{ south: number, west: number, north: number, east: number }} [bounds]
 *   Only records inside this bounding box.
 */

/**
 * The single integration point for a back end. Implement this once (REST,
 * Firebase, Supabase, Appwrite, ...) and pass it to the app in `main.js`.
 * Nothing else in the app reads or writes stored data.
 * @template [T=Record<string, unknown>]
 * @typedef {object} DataSource
 * @property {(query?: GeoQuery) => Promise<GeoRecord<T>[]>} list
 * @property {(id: string) => Promise<GeoRecord<T> | undefined>} get
 * @property {(input: GeoRecordInput<T>) => Promise<GeoRecord<T>>} create
 * @property {(id: string, patch: Partial<GeoRecordInput<T>>) => Promise<GeoRecord<T>>} update
 * @property {(id: string) => Promise<void>} remove
 * @property {(listener: () => void) => () => void} [subscribe]
 *   Optional. Called whenever records change; returns an unsubscribe function.
 */

/**
 * What a guard is asked about. A record is only supplied when one exists.
 * @typedef {"create" | "read" | "update" | "delete"} GuardAction
 */

/**
 * Decides whether an action on a point is allowed. Synchronous, because views use
 * it while building the page; a real authentication layer should resolve the user
 * first and answer from that state. It is a convenience for the interface, not
 * security: the back end must make the same decision (see auth/guard.js).
 * @typedef {object} Guard
 * @property {(action: GuardAction, record?: GeoRecord) => boolean} can
 */

/**
 * Passed to every view.
 * @typedef {object} AppContext
 * @property {DataSource} data Wrapped by `guardDataSource`, so it enforces `guard`.
 * @property {Guard} guard Ask this before offering an action, to hide what is not allowed.
 * @property {import("./state/flags.js").Flags} flags
 * @property {TileAccess} [tiles] Present only where proxied tiles can be offered
 *   (the signed-in start-up); absent in local mode, which uses OpenStreetMap.
 * @property {PeopleAccess} [people] Present where people can be managed (the signed-in
 *   start-up, and a stand-in in local mode). Check `available()` before offering it.
 * @property {AuditAccess} [audit] Present where the activity log can be read (as `people`).
 * @property {ProjectsAccess} [projects] Present where projects can be used (the
 *   signed-in start-up, and a stand-in in local mode). Check `available()` first.
 */

/**
 * Who stamped a project, action or note, and when. Set by the data source, never by a
 * caller.
 * @typedef {object} Stamps
 * @property {string} id
 * @property {string} createdBy User id of the author.
 * @property {string} createdByEmail
 * @property {string} createdAt ISO 8601.
 * @property {string} updatedAt ISO 8601.
 * @property {string} updatedBy User id of the last person to change it.
 * @property {string} updatedByEmail
 */

/**
 * A project, or a sub-project when `parentId` is set.
 * @typedef {object} ProjectFields
 * @property {string} title
 * @property {string} summary May be empty.
 * @property {"planning" | "active" | "on-hold" | "complete"} status
 * @property {string | null} parentId The project this is part of, or null at the top.
 *   Fixed once created.
 * @property {string} responsibleUid The councillor in charge of it.
 * @property {string} responsibleEmail Kept beside the id so a name can still be shown if
 *   the directory cannot be reached.
 * @property {string[]} featureIds Ids of map features (records in `ctx.data`) it concerns.
 */

/** @typedef {ProjectFields & Stamps} Project */
/** @typedef {ProjectFields} ProjectInput */
/** @typedef {Partial<Omit<ProjectFields, "parentId">>} ProjectPatch */

/**
 * One job within a project, shown as a card on its board.
 * @typedef {object} ActionFields
 * @property {string} projectId Fixed once created.
 * @property {string} title
 * @property {string} details May be empty.
 * @property {string} lane One of the ids in `LANES` (projects/model.js).
 * @property {number} order Position within the lane; lower is nearer the top.
 * @property {string} [assigneeUid] Who it is for. Set together with `assigneeEmail`.
 * @property {string} [assigneeEmail]
 * @property {string} [dueDate] Year-month-day.
 * @property {string[]} featureIds Ids of map features it concerns.
 */

/** @typedef {ActionFields & Stamps} ProjectAction */
/** @typedef {ActionFields} ActionInput */
/**
 * To clear an optional field, pass it as `undefined`.
 * @typedef {Partial<Omit<ActionFields, "projectId">>} ActionPatch
 */

/**
 * A note on a project, or on one of its actions when `actionId` is set.
 * @typedef {object} NoteFields
 * @property {string} projectId Fixed once created.
 * @property {string} [actionId] Fixed once created.
 * @property {string} body
 */

/** @typedef {NoteFields & Stamps} ProjectNote */
/** @typedef {NoteFields} NoteInput */
/** @typedef {Pick<NoteFields, "body">} NotePatch */

/**
 * Everything the projects feature holds, as it stands.
 * @typedef {object} ProjectsData
 * @property {Project[]} projects Oldest first.
 * @property {ProjectAction[]} actions In board order.
 * @property {ProjectNote[]} notes Oldest first.
 */

/**
 * Reading and writing projects, actions and notes. Each write rejects with a readable
 * Error when refused. Like `DataSource`, this is the only way the app reaches stored
 * projects; the signed-in start-up wraps it so `ProjectGuard` is enforced.
 * @typedef {object} ProjectsStore
 * @property {() => Promise<ProjectsData>} load
 * @property {(listener: () => void) => () => void} subscribe Called whenever anything
 *   changes; returns an unsubscribe function.
 * @property {(input: ProjectInput) => Promise<Project>} createProject
 * @property {(id: string, patch: ProjectPatch) => Promise<Project>} updateProject
 * @property {(id: string) => Promise<void>} removeProject Also removes its sub-projects,
 *   and the actions and notes of all of them.
 * @property {(input: ActionInput) => Promise<ProjectAction>} createAction
 * @property {(id: string, patch: ActionPatch) => Promise<ProjectAction>} updateAction
 *   Changing `lane` or `order` is moving it.
 * @property {(id: string) => Promise<void>} removeAction
 * @property {(input: NoteInput) => Promise<ProjectNote>} createNote
 * @property {(id: string, patch: NotePatch) => Promise<ProjectNote>} updateNote
 * @property {(id: string) => Promise<void>} removeNote
 */

/**
 * What the signed-in person may do with projects. Synchronous, so views can use it while
 * building the page. A convenience for the interface, not security: firestore.rules
 * decides the same things on every request.
 * @typedef {object} ProjectGuard
 * @property {(parent?: Project) => boolean} canCreateProject A top-level project: admin
 *   or clerk. A sub-project: also the councillor responsible for the parent.
 * @property {(project: Project) => boolean} canEditProject Admin, clerk, or the
 *   councillor responsible for it.
 * @property {() => boolean} canReassignProject Change who is responsible: admin or clerk.
 * @property {(uid: string) => boolean} canNameResponsible Whether this person may be made
 *   responsible by the signed-in person: anyone, for admin or clerk; only themselves, for
 *   a councillor adding a sub-project.
 * @property {() => boolean} canDeleteProject Admin or clerk.
 * @property {(project: Project) => boolean} canAddAction Any admin, clerk or councillor.
 * @property {(project: Project) => boolean} canMoveActions Move or reorder actions, and
 *   place a new one outside the first lane: admin, clerk, or the councillor responsible.
 * @property {(action: ProjectAction, project: Project) => boolean} canEditAction The
 *   author, or anyone who can move actions in that project.
 * @property {(action: ProjectAction, project: Project) => boolean} canDeleteAction As
 *   `canEditAction`.
 * @property {() => boolean} canAddNote Any admin, clerk or councillor.
 * @property {(note: ProjectNote) => boolean} canEditNote The author, admin or clerk.
 * @property {(note: ProjectNote) => boolean} canDeleteNote As `canEditNote`.
 */

/**
 * Someone who can be made responsible for a project or given an action.
 * @typedef {object} DirectoryPerson
 * @property {string} uid
 * @property {string} email
 */

/**
 * @typedef {object} ProjectsExtras
 * @property {() => boolean} available True for anyone signed in with a role.
 * @property {ProjectGuard} can
 * @property {() => Promise<DirectoryPerson[]>} directory Who can be named. Rejects with a
 *   readable Error if the list cannot be fetched, so a view can fall back to the emails
 *   already stored on records.
 */

/** @typedef {ProjectsStore & ProjectsExtras} ProjectsAccess */

/**
 * One line of the audit log: who did what to whom.
 * @typedef {object} AuditEntry
 * @property {string} id
 * @property {string} action For example "invite", "setRole", "disable", "enable",
 *   "resetAuthenticators".
 * @property {string} byEmail Who did it.
 * @property {string} targetEmail Who it was done to.
 * @property {string} detail Extra detail, such as the role given; may be empty.
 * @property {string | null} at ISO 8601, or null if unknown.
 */

/**
 * Reading the audit log: only administrators may.
 * @typedef {object} AuditAccess
 * @property {() => boolean} available True for an administrator.
 * @property {(cursor?: unknown) => Promise<{ entries: AuditEntry[], cursor: unknown | null }>} list
 *   The newest entries first. Pass the `cursor` from the previous call for the next page;
 *   it is null when there are no more.
 */

/**
 * A person with an account, as the `api` function describes them.
 * @typedef {object} Person
 * @property {string} uid
 * @property {string} email
 * @property {string | null} role
 * @property {boolean} disabled
 * @property {boolean} emailVerified
 * @property {number} authenticators Enrolled authenticator apps.
 * @property {string | null} lastSignIn ISO 8601, or null if they have never signed in.
 */

/**
 * The `api` function's actions. Each rejects with a readable Error when refused.
 * @typedef {object} PeopleApi
 * @property {() => Promise<Person[]>} list Admin and clerk only.
 * @property {() => Promise<DirectoryPerson[]>} directory Also open to councillors.
 * @property {(email: string, role: string) => Promise<Person>} invite
 * @property {(uid: string, role: string) => Promise<void>} setRole
 * @property {(uid: string, disabled: boolean) => Promise<void>} setDisabled
 * @property {(uid: string) => Promise<void>} resetAuthenticators
 */

/**
 * Managing people: only an admin or the clerk may.
 * @typedef {object} PeopleAccess
 * @property {() => boolean} available True for an admin or clerk.
 * @property {() => string | undefined} role The signed-in person's role.
 * @property {() => string | undefined} uid The signed-in person's id.
 * @property {PeopleApi} api
 * @property {(email: string) => Promise<void>} sendInvitation Asks Firebase to email the
 *   person a link to choose their password.
 */

/**
 * Whether the current person may use a provider whose tiles come through our tile proxy,
 * and how to ask for them.
 * @typedef {object} TileAccess
 * @property {(provider: { roles?: string[] }) => boolean} canUse True if the person's role is one the provider allows.
 * @property {() => Promise<string>} getToken A current ID token for the tile proxy.
 */

/**
 * Everything that differs from one council to the next, in `deployment/parish.config.js`
 * (copy `deployment.example/` to start). `src/config.js` checks it when the app starts.
 * @typedef {object} ParishConfig
 * @property {string} appName Shown in the header, the sign-in screen and the page title,
 *   e.g. "Exampleton Parish Map".
 * @property {object} council
 * @property {string} council.name Full name, e.g. "Exampleton Parish Council".
 * @property {string} council.area The place, e.g. "Exampleton".
 * @property {"parish" | "town" | "community"} council.kind Used in wording such as "parish boundary".
 * @property {string} [council.clerkTitle] Defaults to "Parish Clerk", "Town Clerk" or "Community Clerk".
 * @property {[number, number]} centre Map centre as [lat, lng].
 * @property {number} zoom Starting zoom.
 * @property {number} minZoom Furthest the map may be zoomed out.
 * @property {[[number, number], [number, number]]} bounds [south-west, north-east] as [lat, lng].
 *   The map cannot be panned beyond this, and points outside it are refused.
 * @property {string} storagePrefix localStorage key prefix, e.g. "exampleton-map:".
 * @property {string} [region] Where the Cloud Functions run, e.g. "europe-west2" (London).
 *   Defaults to "europe-west2". Set it before the first deploy.
 * @property {string} [sourceUrl] Where this copy's source code is offered from, for the
 *   About page. Defaults to the public project; set it only if you run a modified copy
 *   (the AGPL asks you to offer your changes to the people who use it).
 * @property {import("./tiles/providers.js").TilesConfig} [tiles] Which map tiles people see.
 *   OpenStreetMap by default; see docs/tile-providers.md.
 */

/**
 * A view renders into `container` and may return a cleanup function, which the
 * router calls before rendering the next view (for example to remove a map).
 * @typedef {(container: HTMLElement, ctx: AppContext) => void | (() => void) | Promise<void | (() => void)>} RenderFn
 */

/**
 * @typedef {object} Route
 * @property {string} path Exact path, without the base URL, e.g. "/about".
 * @property {string} title Used for document.title and the screen-reader announcement.
 * @property {() => Promise<{ render: RenderFn }>} load Lazy import of the view module.
 */

export {};
