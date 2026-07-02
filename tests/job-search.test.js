import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadSharedScripts, unloadSharedNamespaces } from "./_load.js";

function reload() {
    unloadSharedNamespaces([
        "AMZ_CONSTANTS",
        "AMZ_TEXT",
        "AMZ_STORAGE",
        "AMZ_CITY_TAGS",
        "AMZ_RUNTIME_CONTROLS",
        "AMZ_STATE",
        "AMZ_JOB_SEARCH",
    ]);
    loadSharedScripts([
        "shared/constants.js",
        "shared/utils/text.js",
        "shared/utils/storage.js",
        "shared/utils/city-tags.js",
        "shared/utils/runtime-controls.js",
        "shared/utils/state-store.js",
        "content/utils/job-search.js",
    ]);
}

function useLocalStore(initial = {}) {
    const store = { ...initial };
    globalThis.chrome.storage.local.get = vi.fn((keys, cb) => {
        let result = {};
        if (Array.isArray(keys)) {
            keys.forEach(key => {
                if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = store[key];
            });
        } else if (typeof keys === "string") {
            if (Object.prototype.hasOwnProperty.call(store, keys)) result[keys] = store[keys];
        } else {
            result = { ...store };
        }
        if (typeof cb === "function") cb(result);
        return Promise.resolve(result);
    });
    return store;
}

beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    reload();
    window.localStorage.clear();
    vi.spyOn(Math, "random").mockReturnValue(0);
});

function buildRequest(jobType, overrides = {}) {
    return globalThis.AMZ_JOB_SEARCH.buildRequestBody({
        lat: "48.650629",
        lng: "-123.398604",
        distance: "50",
        jobType,
        ...overrides,
    }).variables.searchJobRequest;
}

function findJobTypeFilter(request) {
    return request.containFilters?.find(filter => filter.key === "jobType");
}

const MAX_PAY_SORTER = [{
    fieldName: "totalPayRateMax",
    ascending: "false",
}];

function buildUkAllCitiesHarShape() {
    return {
        locale: "en-GB",
        country: "United Kingdom",
        keyWords: "",
        equalFilters: [],
        containFilters: [{
            key: "isPrivateSchedule",
            val: ["true", "false"],
        }],
        rangeFilters: [],
        orFilters: [],
        dateFilters: [],
        pageSize: 100,
        sorters: MAX_PAY_SORTER,
        consolidateSchedule: true,
    };
}

function buildUkScheduleHarShape(jobId, startDate) {
    return {
        locale: "en-GB",
        country: "United Kingdom",
        keyWords: "",
        equalFilters: [],
        containFilters: [{
            key: "isPrivateSchedule",
            val: ["true", "false"],
        }],
        rangeFilters: [],
        orFilters: [],
        dateFilters: [{
            key: "firstDayOnSite",
            range: { startDate },
        }],
        sorters: MAX_PAY_SORTER,
        pageSize: 1000,
        jobId,
        consolidateSchedule: true,
    };
}

describe("AMZ_JOB_SEARCH", () => {
    it("builds the active country request without sending a jobType GraphQL filter when both buckets are selected", () => {
        const body = globalThis.AMZ_JOB_SEARCH.buildRequestBody({
            lat: "48.650629",
            lng: "-123.398604",
            distance: "50",
            jobType: ["FULL_TIME", "PART_TIME"],
        });
        const { AMAZON } = globalThis.AMZ_CONSTANTS;
        const request = body.variables.searchJobRequest;

        expect(request.locale).toBe(AMAZON.COUNTRY_CONFIG.locale);
        expect(request.country).toBe(AMAZON.COUNTRY_CONFIG.country);
        expect(request.containFilters).toEqual([{
            key: "isPrivateSchedule",
            val: ["true", "false"],
        }]);
        expect(request.containFilters.some(filter => filter.key === "jobType")).toBe(false);
        expect(request.dateFilters).toEqual([]);

        if (AMAZON.COUNTRY_CONFIG.search.includeGeoQueryClause !== false) {
            expect(request.equalFilters).toEqual([]);
            expect(request.sorters).toEqual(MAX_PAY_SORTER);
            expect(request.rangeFilters).toEqual([]);
            expect(request.geoQueryClause).toEqual({
                lat: 48.650629,
                lng: -123.398604,
                unit: "mi",
                distance: 50,
            });
            expect(request.consolidateSchedule).toBe(true);
        } else {
            expect(request.equalFilters).toEqual([{
                key: "scheduleRequiredLanguage",
                val: "en-US",
            }]);
            expect(request.sorters).toEqual([{
                fieldName: "totalPayRateMax",
                ascending: "false",
            }]);
            expect(request.rangeFilters).toEqual([{
                key: "hoursPerWeek",
                range: { minimum: 0, maximum: 80 },
            }]);
            expect(request.geoQueryClause).toBeUndefined();
            expect(request.consolidateSchedule).toBe(true);
        }

        expect(body.query).toContain("jobType");
        expect(body.query).toContain("jobTypeL10N");
        expect(body.query).toContain("employmentType");
        expect(body.query).toContain("employmentTypeL10N");
        expect(body.query).toContain("scheduleCount");
        expect(body.query).toContain("postalCode");
        expect(body.query).toContain("currencyCode");
        expect(body.query).toContain("geoClusterDescription");
        expect(body.query).toContain("payFrequency");
        expect(body.query).toContain("jobLocationType");
        expect(body.query).toContain("internalStaffingOrgId");
        expect(body.query).toContain("advertisedBasePay");
        expect(body.query).toContain("__typename");
    });

    it("keeps GraphQL request headers to app-owned values", () => {
        const headers = globalThis.AMZ_CONSTANTS.AMAZON.GRAPHQL.REQUEST_HEADERS;

        expect(headers).toEqual({
            accept: "*/*",
            "content-type": "application/json",
            iscanary: "false",
        });
        expect(Object.keys(headers).some(key => key.startsWith("sec-"))).toBe(false);
    });

    it("can build the legacy bearer authorization shape when needed", () => {
        window.localStorage.setItem("sessionToken", "session-token");
        window.localStorage.setItem("bbCandidateId", "candidate-id");

        expect(globalThis.AMZ_JOB_SEARCH.getAuthorizationHeader()).toBe(
            "Bearer Status|logged-in|Session|session-token"
        );
    });

    it("marks the GraphQL authorization shape unauthenticated when no candidate is present", () => {
        window.localStorage.setItem("sessionToken", "session-token");

        expect(globalThis.AMZ_JOB_SEARCH.getAuthorizationHeader()).toBe(
            "Bearer Status|unauthenticated|Session|session-token"
        );
    });

    it("adds GraphQL authorization when a session token is present", async () => {
        window.localStorage.setItem("sessionToken", "session-token");
        window.localStorage.setItem("bbCandidateId", "candidate-id");
        globalThis.fetch = vi.fn(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: { searchJobCardsByLocation: { jobCards: [] } },
                }),
            })
        );

        const result = await globalThis.AMZ_JOB_SEARCH.fetchJobCards({
            lat: 48.65,
            lng: -123.39,
            distance: "50",
            jobType: "",
            jobSearch: { fallbackDistanceKm: "5", fetchTimeoutMs: 0 },
        });

        expect(result.state).toBe("success");
        const [, init] = globalThis.fetch.mock.calls[0];
        expect(init.headers.Authorization).toBe(
            "Bearer Status|logged-in|Session|session-token"
        );
        expect(init.headers.country).toBe(globalThis.AMZ_CONSTANTS.AMAZON.COUNTRY_CONFIG.country);
    });

    it.each([
        [[]],
        [["FLEX_TIME"]],
        [["REDUCED_TIME"]],
        [["PART_TIME", "FLEX_TIME", "REDUCED_TIME"]],
        [["FULL_TIME", "PART_TIME"]],
        [["FULL_TIME", "FLEX_TIME"]],
        [["FULL_TIME", "PART_TIME", "FLEX_TIME", "REDUCED_TIME"]],
    ])("omits GraphQL jobType filters unless exactly one official bucket is selected: %j", jobType => {
        expect(globalThis.AMZ_JOB_SEARCH.getJobTypeContainFilter(jobType)).toBeNull();

        const request = buildRequest(jobType);
        expect(findJobTypeFilter(request)).toBeUndefined();
    });

    it("builds official UK jobType GraphQL filters for single supported buckets", () => {
        expect(globalThis.AMZ_JOB_SEARCH.getJobTypeContainFilter(["FULL_TIME"])).toEqual({
            key: "jobType",
            val: ["Full-time"],
        });
        expect(globalThis.AMZ_JOB_SEARCH.getJobTypeContainFilter(["PART_TIME"])).toEqual({
            key: "jobType",
            val: ["Part-time"],
        });
        expect(findJobTypeFilter(buildRequest(["FULL_TIME"]))).toEqual({
            key: "jobType",
            val: ["Full-time"],
        });
    });

    it("can disable jobType GraphQL filtering for non-UK-compatible contexts", () => {
        expect(globalThis.AMZ_JOB_SEARCH.getJobTypeContainFilter(["FULL_TIME"], false)).toBeNull();
        expect(globalThis.AMZ_JOB_SEARCH.getJobTypeContainFilter(["PART_TIME"], false)).toBeNull();
        expect(globalThis.AMZ_JOB_SEARCH.getJobTypeContainFilter(["FLEX_TIME"], false)).toBeNull();
        expect(globalThis.AMZ_JOB_SEARCH.getJobTypeContainFilter(["REDUCED_TIME"], false)).toBeNull();
    });

    it("uses the stored fallback distance when the selected distance is blank", async () => {
        const { STORAGE_KEYS } = globalThis.AMZ_CONSTANTS;
        useLocalStore({ [STORAGE_KEYS.JOB_SEARCH_FALLBACK_DISTANCE_KM]: "5" });
        globalThis.fetch = vi.fn(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: { searchJobCardsByLocation: { jobCards: [] } },
                }),
            })
        );

        const result = await globalThis.AMZ_JOB_SEARCH.fetchJobCards({
            lat: 48.65,
            lng: -123.39,
            distance: "",
            jobType: "",
        });

        expect(result.state).toBe("success");
        const [, init] = globalThis.fetch.mock.calls[0];
        const body = JSON.parse(init.body);
        expect(init.headers.Authorization).toBeUndefined();
        if (globalThis.AMZ_CONSTANTS.AMAZON.COUNTRY_CONFIG.search.includeGeoQueryClause !== false) {
            expect(body.variables.searchJobRequest.geoQueryClause.distance).toBe(5);
        } else {
            expect(body.variables.searchJobRequest.geoQueryClause).toBeUndefined();
        }
    });

    it("uses supplied in-memory job search controls without reading storage during fetch", async () => {
        const { STORAGE_KEYS } = globalThis.AMZ_CONSTANTS;
        useLocalStore({ [STORAGE_KEYS.JOB_SEARCH_FALLBACK_DISTANCE_KM]: "5" });
        globalThis.fetch = vi.fn(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: { searchJobCardsByLocation: { jobCards: [] } },
                }),
            })
        );
        globalThis.chrome.storage.local.get.mockClear();

        const result = await globalThis.AMZ_JOB_SEARCH.fetchJobCards({
            lat: 48.65,
            lng: -123.39,
            distance: "",
            jobType: "",
            jobSearch: {
                fallbackDistanceKm: "9",
                fetchTimeoutMs: 0,
            },
        });

        expect(result.state).toBe("success");
        expect(globalThis.chrome.storage.local.get).not.toHaveBeenCalled();
        const [, init] = globalThis.fetch.mock.calls[0];
        const body = JSON.parse(init.body);
        if (globalThis.AMZ_CONSTANTS.AMAZON.COUNTRY_CONFIG.search.includeGeoQueryClause !== false) {
            expect(body.variables.searchJobRequest.geoQueryClause.distance).toBe(9);
        } else {
            expect(body.variables.searchJobRequest.geoQueryClause).toBeUndefined();
        }
    });

    it("omits only geo clauses for all-cities searches", () => {
        const body = globalThis.AMZ_JOB_SEARCH.buildRequestBody({
            lat: "48.650629",
            lng: "-123.398604",
            distance: "50",
            selectedCity: "",
            allCitiesSelected: true,
            cityTags: ["Sidney", "Toronto"],
        });
        const request = body.variables.searchJobRequest;

        if (globalThis.AMZ_CONSTANTS.AMAZON.COUNTRY_CONFIG.search.supportsAllCitiesSearch === true) {
            expect(request.geoQueryClause).toBeUndefined();
            expect(request.keyWords).toBe("");
            expect(request.equalFilters).toEqual([]);
            expect(request.containFilters).toEqual([{
                key: "isPrivateSchedule",
                val: ["true", "false"],
            }]);
            expect(request.rangeFilters).toEqual([]);
            expect(request.orFilters).toEqual([]);
            expect(request.dateFilters).toEqual([]);
            expect(request.consolidateSchedule).toBe(true);
            expect(request.sorters).toEqual(MAX_PAY_SORTER);
        } else {
            expect(request.geoQueryClause).toBeUndefined();
            expect(request.rangeFilters).toEqual([{
                key: "hoursPerWeek",
                range: { minimum: 0, maximum: 80 },
            }]);
            expect(request.consolidateSchedule).toBe(true);
        }
    });

    it("matches the captured UK all-cities GraphQL request shape", () => {
        const body = globalThis.AMZ_JOB_SEARCH.buildRequestBody({
            lat: "48.650629",
            lng: "-123.398604",
            distance: "25000",
            selectedCity: "",
            allCitiesSelected: true,
            cityTags: ["Sidney", "Toronto"],
            jobType: [],
        });
        const request = body.variables.searchJobRequest;

        expect(request).toEqual(buildUkAllCitiesHarShape());
        expect(request.geoQueryClause).toBeUndefined();
    });

    it("uses the website no-geo shape when selected city has additional city tags", () => {
        const body = globalThis.AMZ_JOB_SEARCH.buildRequestBody({
            lat: "51.507218",
            lng: "-0.127586",
            distance: "150",
            selectedCity: "London",
            allCitiesSelected: false,
            cityTags: ["London", "Edinburgh"],
            jobType: ["FULL_TIME"],
        });
        const request = body.variables.searchJobRequest;

        expect(request).toEqual(buildUkAllCitiesHarShape());
        expect(request.geoQueryClause).toBeUndefined();
        expect(findJobTypeFilter(request)).toBeUndefined();
    });

    it("keeps geo search when the selected city is the only location target", () => {
        const body = globalThis.AMZ_JOB_SEARCH.buildRequestBody({
            lat: "51.507218",
            lng: "-0.127586",
            distance: "150",
            selectedCity: "London",
            allCitiesSelected: false,
            cityTags: ["London"],
            jobType: [],
        });
        const request = body.variables.searchJobRequest;

        expect(request.geoQueryClause).toEqual({
            lat: 51.507218,
            lng: -0.127586,
            unit: "mi",
            distance: 150,
        });
        expect(request.containFilters).toEqual([{
            key: "isPrivateSchedule",
            val: ["true", "false"],
        }]);
    });

    it("matches the official UK schedule GraphQL request shape for a known job", () => {
        const jobId = "JOB-UK-0000000434";
        const body = globalThis.AMZ_JOB_SEARCH.buildScheduleRequestBody({ jobId });
        const request = body.variables.searchScheduleRequest;
        const today = new Date().toISOString().split("T")[0];

        expect(body.operationName).toBe("searchScheduleCards");
        expect(body.query).toContain("query searchScheduleCards");
        expect(body.query).toContain("scheduleCards");
        expect(body.query).toContain("scheduleId");

        expect(request).toEqual(buildUkScheduleHarShape(jobId, today));
        expect(request.geoQueryClause).toBeUndefined();
        expect(request.containFilters.some(filter => filter.key === "scheduleShift")).toBe(false);
    });

    it("fetches schedule cards with the official schedule GraphQL operation", async () => {
        const scheduleCard = {
            jobId: "JOB-CA-0000000434",
            scheduleId: "SCH-CA-0000005935",
            city: "Whitby",
            state: "ON",
        };
        globalThis.fetch = vi.fn(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: {
                        searchScheduleCards: {
                            nextToken: null,
                            scheduleCards: [scheduleCard],
                        },
                    },
                }),
            })
        );

        const result = await globalThis.AMZ_JOB_SEARCH.fetchScheduleCards({
            jobId: scheduleCard.jobId,
            jobSearch: { fetchTimeoutMs: 0 },
        });

        expect(result).toEqual(expect.objectContaining({
            state: "success",
            status: 200,
            scheduleCards: [scheduleCard],
            nextToken: null,
            isAuthError: false,
            isWafBlocked: false,
        }));
        const [, init] = globalThis.fetch.mock.calls[0];
        const body = JSON.parse(init.body);
        expect(body.operationName).toBe("searchScheduleCards");
        expect(body.variables.searchScheduleRequest.jobId).toBe(scheduleCard.jobId);
        expect(init.headers.country).toBe(globalThis.AMZ_CONSTANTS.AMAZON.COUNTRY_CONFIG.country);
        expect(init.headers.Authorization).toBeUndefined();
    });

    it("adds schedule GraphQL authorization when a session token is present", async () => {
        const scheduleCard = {
            jobId: "JOB-CA-0000000434",
            scheduleId: "SCH-CA-0000005935",
        };
        window.localStorage.setItem("sessionToken", "session-token");
        window.localStorage.setItem("bbCandidateId", "candidate-id");
        globalThis.fetch = vi.fn(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: {
                        searchScheduleCards: {
                            nextToken: null,
                            scheduleCards: [scheduleCard],
                        },
                    },
                }),
            })
        );

        const result = await globalThis.AMZ_JOB_SEARCH.fetchScheduleCards({
            jobId: scheduleCard.jobId,
            jobSearch: { fetchTimeoutMs: 0 },
        });

        expect(result.state).toBe("success");
        const [, init] = globalThis.fetch.mock.calls[0];
        expect(init.headers.Authorization).toBe(
            "Bearer Status|logged-in|Session|session-token"
        );
        expect(init.headers.country).toBe(globalThis.AMZ_CONSTANTS.AMAZON.COUNTRY_CONFIG.country);
    });

    it("adds jitter before job search GraphQL requests", async () => {
        vi.useFakeTimers();
        Math.random.mockReturnValue(0.999);
        globalThis.fetch = vi.fn(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: { searchJobCardsByLocation: { jobCards: [] } },
                }),
            })
        );

        const resultPromise = globalThis.AMZ_JOB_SEARCH.fetchJobCards({
            lat: 48.65,
            lng: -123.39,
            distance: "50",
            jobType: "",
            jobSearch: {
                fallbackDistanceKm: "5",
                fetchTimeoutMs: 0,
            },
        });

        await vi.advanceTimersByTimeAsync(49);
        expect(globalThis.fetch).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);

        const result = await resultPromise;
        expect(result.state).toBe("success");
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("adds jitter before schedule GraphQL requests", async () => {
        vi.useFakeTimers();
        Math.random.mockReturnValue(0.999);
        globalThis.fetch = vi.fn(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: {
                        searchScheduleCards: {
                            nextToken: null,
                            scheduleCards: [],
                        },
                    },
                }),
            })
        );

        const resultPromise = globalThis.AMZ_JOB_SEARCH.fetchScheduleCards({
            jobId: "JOB-CA-0000000434",
            jobSearch: { fetchTimeoutMs: 0 },
        });

        await vi.advanceTimersByTimeAsync(49);
        expect(globalThis.fetch).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);

        const result = await resultPromise;
        expect(result.state).toBe("success");
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("does not call schedule GraphQL without a job id", async () => {
        globalThis.fetch = vi.fn();

        const result = await globalThis.AMZ_JOB_SEARCH.fetchScheduleCards({
            jobSearch: { fetchTimeoutMs: 0 },
        });

        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(result).toEqual(expect.objectContaining({
            state: "failed",
            status: null,
            scheduleCards: [],
            details: expect.stringContaining("Missing jobId"),
        }));
    });

    it("summarizes debug request shape without auth headers or GraphQL text", () => {
        const body = globalThis.AMZ_JOB_SEARCH.buildRequestBody({
            lat: "48.650629",
            lng: "-123.398604",
            distance: "50",
            selectedCity: "",
            allCitiesSelected: true,
            cityTags: ["Sidney", "Toronto"],
            jobType: ["PART_TIME"],
        });

        const summary = globalThis.AMZ_JOB_SEARCH.summarizeRequestBody(body, {
            selectedCity: "",
            allCitiesSelected: true,
            cityTags: ["Sidney", "Toronto"],
            jobType: ["PART_TIME"],
        }, {
            fallbackDistanceKm: "5",
            fetchTimeoutMs: 15000,
        });

        expect(summary).toEqual(expect.objectContaining({
            operationName: "searchJobCardsByLocation",
            country: globalThis.AMZ_CONSTANTS.AMAZON.COUNTRY_CONFIG.country,
            locale: globalThis.AMZ_CONSTANTS.AMAZON.COUNTRY_CONFIG.locale,
            allCitiesSearch: true,
            noGeoLocationSearch: true,
            selectedCity: null,
            selectedJobTypes: ["PART_TIME"],
            cityTagCount: 2,
            geoQueryClauseSent: false,
            fallbackDistanceKm: "5",
            timeoutMs: 15000,
        }));
        expect(JSON.stringify(summary)).not.toContain("Authorization");
        expect(JSON.stringify(summary)).not.toContain("Bearer");
        expect(JSON.stringify(summary)).not.toContain("query searchJobCardsByLocation");
    });

    it("uses explicit all-cities state even before city tags are hydrated", () => {
        const request = globalThis.AMZ_JOB_SEARCH.buildRequestBody({
            lat: "48.650629",
            lng: "-123.398604",
            distance: "50",
            selectedCity: "",
            allCitiesSelected: true,
            cityTags: [],
            jobType: ["FULL_TIME"],
        }).variables.searchJobRequest;

        expect(request.geoQueryClause).toBeUndefined();
        expect(findJobTypeFilter(request)).toBeUndefined();
        expect(request.containFilters).toEqual([{
            key: "isPrivateSchedule",
            val: ["true", "false"],
        }]);
        expect(request.consolidateSchedule).toBe(true);
    });

    it("only requires location coordinates when the active country search uses geo", async () => {
        const { STORAGE_KEYS } = globalThis.AMZ_CONSTANTS;
        useLocalStore({ [STORAGE_KEYS.JOB_SEARCH_FALLBACK_DISTANCE_KM]: "5" });
        globalThis.fetch = vi.fn(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: { searchJobCardsByLocation: { jobCards: [] } },
                }),
            })
        );

        const result = await globalThis.AMZ_JOB_SEARCH.fetchJobCards({
            lat: null,
            lng: null,
            distance: "",
            jobType: "",
        });

        if (globalThis.AMZ_CONSTANTS.AMAZON.COUNTRY_CONFIG.search.includeGeoQueryClause !== false) {
            expect(globalThis.fetch).not.toHaveBeenCalled();
            expect(result).toEqual(expect.objectContaining({
                state: "failed",
                status: null,
                jobCards: [],
                details: expect.stringContaining("Missing location coordinates"),
                isAuthError: false,
            }));
        } else {
            expect(globalThis.fetch).toHaveBeenCalledTimes(1);
            expect(result).toEqual(expect.objectContaining({
                state: "success",
                status: 200,
                jobCards: [],
                isAuthError: false,
            }));
        }
    });

    it("marks only 401 GraphQL responses as auth errors by status", async () => {
        const { STORAGE_KEYS } = globalThis.AMZ_CONSTANTS;
        useLocalStore({ [STORAGE_KEYS.JOB_SEARCH_FALLBACK_DISTANCE_KM]: "5" });
        globalThis.fetch = vi.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: () => Promise.resolve({}),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 403,
                json: () => Promise.resolve({}),
            });

        const unauthorized = await globalThis.AMZ_JOB_SEARCH.fetchJobCards({
            lat: 48.65,
            lng: -123.39,
            distance: "50",
            jobType: "",
        });
        const forbidden = await globalThis.AMZ_JOB_SEARCH.fetchJobCards({
            lat: 48.65,
            lng: -123.39,
            distance: "50",
            jobType: "",
        });

        expect(unauthorized).toEqual(expect.objectContaining({
            state: "failed",
            status: 401,
            jobCards: [],
            isAuthError: true,
        }));
        expect(forbidden).toEqual(expect.objectContaining({
            state: "failed",
            status: 403,
            jobCards: [],
            isAuthError: false,
        }));
    });

    it("classifies GraphQL WAF 403 as retryable WAF block instead of auth failure", async () => {
        const { STORAGE_KEYS } = globalThis.AMZ_CONSTANTS;
        useLocalStore({ [STORAGE_KEYS.JOB_SEARCH_FALLBACK_DISTANCE_KM]: "5" });
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 403,
            json: () => Promise.resolve({
                errors: [{ errorType: "WAFForbiddenException", message: "403 Forbidden" }],
            }),
        });

        const result = await globalThis.AMZ_JOB_SEARCH.fetchJobCards({
            lat: 48.65,
            lng: -123.39,
            distance: "50",
            jobType: "",
        });

        expect(result).toEqual(expect.objectContaining({
            state: "failed",
            status: 403,
            jobCards: [],
            isAuthError: false,
            isWafBlocked: true,
            details: expect.stringContaining("Amazon WAF"),
        }));
    });
});
