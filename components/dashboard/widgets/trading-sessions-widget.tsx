"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Globe } from "lucide-react";

import { cn } from "@/lib/utils";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import worldMap from "world-atlas/countries-110m.json";

import type { SessionStatus, TradingSession } from "@/types/dashboard";

import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TimezoneOption = {
  label: string;
  offset: number;
};

type TopologyLike = {
  objects: {
    countries: unknown;
  };
};

const timeToNext = (targetHour: number, nowHour: number) => {
  const diff = (targetHour - nowHour + 24) % 24;
  const fullHours = Math.floor(diff);
  const minutes = Math.floor((diff - fullHours) * 60);
  return `${fullHours}h ${minutes}m`;
};

const getSessionStatus = (session: TradingSession, nowHour: number) => {
  const { utcOpenHour: open, utcCloseHour: close } = session;
  const isOvernight = open > close;
  const active = isOvernight ? nowHour >= open || nowHour < close : nowHour >= open && nowHour < close;

  if (active) {
    const closesIn = timeToNext(close, nowHour);
    return {
      status: "Active" as SessionStatus,
      lineOne: `Active • Closes in ${closesIn}`,
      label: "Active"
    };
  }

  const opensInHours = (open - nowHour + 24) % 24;
  if (opensInHours <= 1) {
    return {
      status: "Opening Soon" as SessionStatus,
      lineOne: `Opening Soon • Opens in ${Math.round(opensInHours * 60)}m`,
      label: "Opening Soon"
    };
  }

  return {
    status: "Closed" as SessionStatus,
    lineOne: `Closed • Opens in ${timeToNext(open, nowHour)}`,
    label: "Closed"
  };
};

const timezoneOptions: TimezoneOption[] = [
  { label: "JST", offset: 9 },
  { label: "GMT", offset: 0 },
  { label: "EST", offset: -5 },
  { label: "PST", offset: -8 },
  { label: "CET", offset: 1 },
];

const sessions_details = [
  { id: "new-york", pre: "06:00-08:00", reg: "08:00-17:00", tzName: "EST" },
  { id: "london", pre: null, reg: "08:00-17:00", tzName: "GMT" },
  { id: "tokyo", pre: null, reg: "09:00-15:00", tzName: "GMT+9" },
  { id: "sydney", pre: null, reg: "10:00-16:00", tzName: "GMT+11" },
];

export function TradingSessionsWidget() {
  const { snapshot } = useDashboardData();
  const [now, setNow] = useState(() => Date.now());
  const [timezoneOffset, setTimezoneOffset] = useState(-5);
  const tradingSessions = snapshot?.tradingSessions ?? [];

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const projection = useMemo(
    () => geoMercator().center([0, 10]).scale(158).translate([500, 225]),
    [],
  );

  const pathBuilder = useMemo(() => geoPath(projection), [projection]);

  const countriesPath = useMemo(() => {
    const topology = worldMap as unknown as TopologyLike;
    const collection = feature(topology as never, topology.objects.countries as never) as unknown;
    const features = Array.isArray((collection as { features?: unknown[] }).features)
      ? (collection as { features: unknown[] }).features
      : [collection];

    return features
      .map((item) => pathBuilder(item as never))
      .filter((item): item is string => Boolean(item));
  }, [pathBuilder]);

  const selectedTzLabel = useMemo(() => {
    return timezoneOptions.find(o => o.offset === timezoneOffset)?.label ?? "GMT";
  }, [timezoneOffset]);

  const headerTime = useMemo(() => {
    const d = new Date(now);
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const shifted = new Date(utc + (3600000 * timezoneOffset));
    return shifted.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  }, [now, timezoneOffset]);

  return (
    <Card className="flex h-full flex-col overflow-hidden rounded-xl border-border dark:border-white/10 shadow-xl shadow-black/5 bg-gradient-to-br from-white to-slate-50 dark:from-card dark:to-muted/10">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 px-6 py-5 pb-2">
        <div className="flex items-start justify-between w-full">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-3 text-base font-bold tracking-tight">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 ring-1 ring-inset ring-indigo-500/10">
                <Globe className="h-4 w-4" strokeWidth={2.5} />
              </div>
              Trading Sessions
            </CardTitle>
            <p className="pl-[48px] text-xs text-muted-foreground">
              Current time: <span className="font-bold text-foreground tabular-nums" suppressHydrationWarning>{headerTime} {selectedTzLabel}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-block text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Timezone</span>
            <div className="relative">
              <select
                value={timezoneOffset}
                onChange={(event) => setTimezoneOffset(Number(event.target.value))}
                className="h-10 appearance-none rounded-xl border border-border bg-white pl-4 pr-10 text-xs font-bold text-foreground shadow-sm transition-all hover:bg-slate-50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 dark:bg-muted dark:border-white/10 dark:hover:bg-muted/80"
              >
                {timezoneOptions.map((option) => (
                  <option key={option.label} value={option.offset}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                <ChevronDown className="h-4 w-4 text-muted-foreground" strokeWidth={2.5} />
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-6">
        <div className="relative h-full w-full overflow-hidden rounded-3xl border-2 border-white/20 bg-[#0b1931] shadow-2xl shadow-indigo-900/20 ring-1 ring-black/5 dark:border-white/10 dark:ring-white/5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_25%,rgba(77,167,124,0.15),transparent_50%),radial-gradient(circle_at_85%_65%,rgba(66,94,157,0.2),transparent_50%)]" />

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative aspect-[1000/450] w-full max-h-full">
              <svg viewBox="0 0 1000 450" className="absolute inset-0 h-full w-full opacity-40">
                <defs>
                  <filter id="marker-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="active-spark" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="1.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
                <g>
                  {countriesPath.map((path, index) => (
                    <path
                      key={`country-${index}`}
                      d={path}
                      fill="#4a7d65"
                      stroke="#325a48"
                      strokeWidth={0.5}
                    />
                  ))}
                </g>

                {tradingSessions.map((session) => {
                  const projected = projection(session.marker);
                  if (!projected) return null;
                  const [x, y] = projected;

                  const d = new Date(now);
                  const utcHour = d.getUTCHours() + d.getUTCMinutes() / 60;
                  const status = getSessionStatus(session, utcHour);
                  const color = status.status === "Active" ? "#25b865" :
                    status.status === "Opening Soon" ? "#ffa31a" : "#ff4d4d";

                  return (
                    <g key={`marker-${session.id}`} filter="url(#marker-glow)">
                      <circle cx={x} cy={y} r="12" fill={color} fillOpacity="0.1">
                        <animate attributeName="r" from="4" to="16" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="fill-opacity" from="0.3" to="0" dur="2s" repeatCount="indefinite" />
                      </circle>
                      <circle cx={x} cy={y} r="8" fill={color} fillOpacity="0.15">
                        <animate attributeName="r" from="4" to="12" dur="2s" begin="0.5s" repeatCount="indefinite" />
                        <animate attributeName="fill-opacity" from="0.4" to="0" dur="2s" begin="0.5s" repeatCount="indefinite" />
                      </circle>
                      <circle cx={x} cy={y} r="4" fill={color} fillOpacity="0.2">
                        <animate attributeName="r" from="4" to="8" dur="2s" begin="1s" repeatCount="indefinite" />
                        <animate attributeName="fill-opacity" from="0.5" to="0" dur="2s" begin="1s" repeatCount="indefinite" />
                      </circle>

                      <circle
                        cx={x}
                        cy={y}
                        r="4.5"
                        fill={color}
                        stroke="white"
                        strokeWidth="1.5"
                        className="drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                      />

                      {status.status === "Active" && (
                        <circle cx={x} cy={y} r="2" fill="white" filter="url(#active-spark)">
                          <animate attributeName="opacity" values="1;0.4;1" dur="0.8s" repeatCount="indefinite" />
                          <animate attributeName="r" values="2;3.5;2" dur="0.8s" repeatCount="indefinite" />
                        </circle>
                      )}
                    </g>
                  );
                })}
              </svg>

              <div className="absolute inset-0 pointer-events-none">
                {tradingSessions.map((session, index) => {
                  const projected = projection(session.marker);
                  if (!projected) return null;
                  const [x, y] = projected;

                  const d = new Date(now);
                  const utcHour = d.getUTCHours() + d.getUTCMinutes() / 60;
                  const status = getSessionStatus(session, utcHour);
                  const detail = sessions_details.find(d => d.id === session.id);

                  const cityLocalTime = (() => {
                    const d = new Date(now);
                    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
                    const offsets: Record<string, number> = { 'tokyo': 9, 'london': 0, 'new-york': -5, 'sydney': 11 };
                    const cityTzOffset = offsets[session.id] ?? 0;
                    const shifted = new Date(utc + (3600000 * cityTzOffset));
                    return shifted.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
                  })();

                  const colorClass = status.status === "Active" ? "bg-primary" :
                    status.status === "Opening Soon" ? "bg-amber-500" : "bg-rose-500";

                  return (
                    <div
                      key={`card-${session.id}`}
                      className="absolute pointer-events-auto z-10 hover:z-50 transition-all font-sans"
                      style={{
                        left: `${(x / 1000) * 100}%`,
                        top: `${(y / 450) * 100}%`
                      }}
                    >
                      <motion.article
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{
                          opacity: 1,
                          scale: 1,
                          y: [0, -4, 0]
                        }}
                        transition={{
                          opacity: { delay: index * 0.1 },
                          scale: { delay: index * 0.1 },
                          y: {
                            duration: 4,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: index * 0.5
                          }
                        }}
                        className={cn(
                          "absolute w-[180px] border border-white/10 bg-[#0d1b35]/90 backdrop-blur-xl p-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)]",
                          "rounded-xl ring-1 ring-white/10",
                          session.id === 'new-york' ? '-translate-x-full -translate-y-full mb-3 mr-3' :
                            session.id === 'london' ? 'ml-3 -translate-y-1/2' :
                              session.id === 'tokyo' ? 'ml-3 -translate-y-full mb-3' : 'ml-3 mt-3'
                        )}
                        style={{
                          left: session.id === 'london' ? '0' : undefined,
                          top: session.id === 'london' ? '0' : undefined,
                          right: (session.id === 'new-york') ? '0' : undefined,
                          bottom: (session.id === 'new-york' || session.id === 'tokyo') ? '0' : undefined,
                        }}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={cn("h-2.5 w-2.5 rounded-full shadow-lg", colorClass, status.status === "Active" && "animate-pulse shadow-[0_0_12px_rgba(var(--primary),0.8)]")} />
                            <span className="text-[13px] font-black tracking-tight text-white">{session.city}</span>
                          </div>
                          <span className={cn(
                            "relative overflow-hidden rounded-md border border-white/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider",
                            status.status === "Active" ? "bg-primary/20 text-primary" :
                              status.status === "Opening Soon" ? "bg-amber-500/20 text-amber-400" : "bg-white/5 text-white/40"
                          )}>
                            {status.label}
                            {status.status === "Active" && (
                              <motion.div
                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                                animate={{ x: ['-100%', '200%'] }}
                                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                              />
                            )}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <p className="text-[11px] font-bold text-white/90" suppressHydrationWarning>
                            {status.lineOne}
                          </p>

                          {detail?.pre && (
                            <p className="text-[10px] font-bold text-white/50">
                              Pre: {detail.pre}
                            </p>
                          )}

                          <p className="text-[10px] font-bold text-white/50 tabular-nums">
                            Reg: {detail?.reg} {detail?.tzName} <span className="text-white/30" suppressHydrationWarning>({cityLocalTime})</span>
                          </p>
                        </div>
                      </motion.article>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
