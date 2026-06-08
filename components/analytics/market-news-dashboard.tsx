"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Sparkles, Loader2, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TAGS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "DollarIndex", "GOLD", "OIL"];

export function MarketNewsDashboard() {
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Reset page when tag changes
  useEffect(() => {
    setPage(1);
    setHasMore(true);
  }, [activeTag]);

  useEffect(() => {
    let isMounted = true;
    const fetchNews = async () => {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);

      try {
        const queryParams = new URLSearchParams({
          limit: "10",
          page: page.toString()
        });
        
        if (activeTag) {
          queryParams.append("search", activeTag);
        }

        const res = await fetch(`/api/market-news?${queryParams.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch news");
        const json = await res.json();
        
        if (!isMounted) return;

        const mappedNews = (json.data || []).map((item: any) => ({
          id: item.uuid,
          title: item.title,
          author: item.source || "Market News",
          date: new Date(item.published_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          excerpt: item.snippet || item.description,
          tags: item.keywords && typeof item.keywords === 'string' ? item.keywords.split(',').slice(0, 3).map((s: string) => s.trim()) : ["MARKET", "FINANCE"],
          image: item.image_url || "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=100&h=100&fit=crop",
          url: item.url
        }));
        
        const limitFromServer = json.meta?.limit || 3;
        if (mappedNews.length < limitFromServer) setHasMore(false);
        else setHasMore(true);

        setNews(prev => page === 1 ? mappedNews : [...prev, ...mappedNews]);
      } catch (error) {
        console.error("Error fetching market news", error);
      } finally {
        if (isMounted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    };
    
    fetchNews();

    return () => { isMounted = false; };
  }, [activeTag, page]);

  // ── Horizontal slider ──────────────────────────────────────────────────────
  const sliderRef     = useRef<HTMLDivElement>(null);
  const isPausedRef   = useRef(false);
  const animFrameRef  = useRef<number | null>(null);
  const hasMoreRef    = useRef(hasMore);
  const isFetchingRef = useRef(false);

  // keep refs in sync so scroll/raf callbacks always see fresh values
  useEffect(() => { hasMoreRef.current    = hasMore;              }, [hasMore]);
  useEffect(() => { isFetchingRef.current = loading || loadingMore; }, [loading, loadingMore]);

  // reset scroll to start when the tag filter changes
  useEffect(() => {
    if (sliderRef.current) sliderRef.current.scrollLeft = 0;
  }, [activeTag]);

  // continuous auto-scroll at ~42 px/s; pauses on pointer enter
  useEffect(() => {
    const slider = sliderRef.current;
    if (!slider) return;
    const tick = () => {
      if (!isPausedRef.current) slider.scrollLeft += 0.7;
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, []);

  // auto-fetch next page when within 600 px of the trailing edge
  useEffect(() => {
    const slider = sliderRef.current;
    if (!slider) return;
    const onScroll = () => {
      const remaining = slider.scrollWidth - slider.scrollLeft - slider.clientWidth;
      if (remaining < 600 && hasMoreRef.current && !isFetchingRef.current) {
        isFetchingRef.current = true;
        setPage(p => p + 1);
      }
    };
    slider.addEventListener("scroll", onScroll, { passive: true });
    return () => slider.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="flex flex-col gap-6 w-full pb-8">
      {/* Hero Banner — Indigo */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-600/20 via-indigo-500/10 to-transparent border border-indigo-500/15 p-8 md:p-10">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/8 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" />
        <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-violet-500/5 rounded-full blur-2xl translate-y-1/2" />
        <div className="relative space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-3 py-1">
            <Sparkles className="h-3 w-3" />
            MARKET NEWS
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Market <span className="text-indigo-400">News</span>
          </h1>
          <p className="text-base text-muted-foreground max-w-md">
            Stay updated with the latest financial news, market analysis, and key economic events.
          </p>
        </div>
      </div>

      {/* Tags */}
      <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none w-full">
        <span className="text-sm text-muted-foreground font-medium whitespace-nowrap">Tags:</span>
        <div className="flex gap-2 min-w-max">
          {TAGS.map(tag => (
            <Badge
              key={tag}
              variant="secondary"
              className={cn(
                "cursor-pointer rounded-xl px-3 py-1.5 text-xs font-bold bg-card border border-border/30 hover:bg-muted/50 text-muted-foreground transition-all",
                activeTag === tag && "bg-primary text-primary-foreground border-primary/50 shadow-md shadow-primary/20"
              )}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* Horizontal News Slider */}
      <div className="relative mt-2 -mx-4 sm:-mx-6 lg:mx-0">
        <style>{`.news-slider::-webkit-scrollbar { display: none; }`}</style>

        {/* Edge fade masks */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent z-10" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent z-10" />

        <div
          ref={sliderRef}
          className="news-slider flex gap-5 overflow-x-auto pb-4 pt-2 px-4 sm:px-6 lg:px-0"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
          onMouseEnter={() => { isPausedRef.current = true;  }}
          onMouseLeave={() => { isPausedRef.current = false; }}
        >
          {loading ? (
            /* ── Initial skeleton cards ── */
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`sk-init-${i}`}
                className="flex-shrink-0 w-72 rounded-2xl border border-border/40 bg-card overflow-hidden animate-pulse"
              >
                <div className="h-44 bg-muted/40" />
                <div className="p-4 space-y-3">
                  <div className="h-2.5 bg-muted/40 rounded w-20" />
                  <div className="h-4 bg-muted/40 rounded w-full" />
                  <div className="h-4 bg-muted/40 rounded w-4/5" />
                  <div className="h-3 bg-muted/40 rounded w-1/2 mt-2" />
                </div>
              </div>
            ))
          ) : news.length > 0 ? (
            <>
              <AnimatePresence initial={false}>
                {news.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: 48 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.42,
                      delay: index < 10 ? index * 0.04 : 0,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    whileHover={{ y: -6, transition: { duration: 0.18, ease: "easeOut" } }}
                    whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
                    className="group flex-shrink-0 w-72 flex flex-col rounded-2xl border border-border/40 bg-card overflow-hidden shadow-sm hover:shadow-xl hover:border-primary/20 cursor-pointer"
                    onClick={() => window.open(item.url, "_blank")}
                  >
                    {/* Article image */}
                    <div className="relative h-44 overflow-hidden bg-muted/20">
                      <motion.img
                        src={item.image}
                        alt=""
                        className="w-full h-full object-cover"
                        initial={{ scale: 1.08 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.55, ease: "easeOut" }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&h=400&fit=crop";
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-card/80 via-transparent to-transparent pointer-events-none" />
                    </div>

                    {/* Card body */}
                    <div className="flex flex-col gap-2 p-4 flex-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="font-bold text-foreground/90 uppercase tracking-wider truncate max-w-[110px]">
                          {item.author}
                        </span>
                        <span className="text-border shrink-0">|</span>
                        <span className="shrink-0">{item.date}</span>
                      </div>

                      <h3 className="text-[14px] font-bold text-foreground leading-snug group-hover:text-primary transition-colors duration-200 line-clamp-3">
                        {item.title}
                        <ExternalLink className="inline-block ml-1.5 h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity relative top-[-1px]" />
                      </h3>

                      <p className="text-[12px] text-foreground/65 leading-relaxed line-clamp-2">
                        {item.excerpt}
                      </p>

                      <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-2">
                        {item.tags.map((tag: string, i: number) => (
                          <span
                            key={i}
                            className="text-[9px] font-semibold text-muted-foreground bg-muted/40 border border-border/40 rounded px-1.5 py-0.5 uppercase tracking-wider"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Skeleton cards while fetching next page */}
              {loadingMore && Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={`sk-more-${i}`}
                  className="flex-shrink-0 w-72 rounded-2xl border border-border/40 bg-card overflow-hidden animate-pulse"
                >
                  <div className="h-44 bg-muted/40" />
                  <div className="p-4 space-y-3">
                    <div className="h-2.5 bg-muted/40 rounded w-20" />
                    <div className="h-4 bg-muted/40 rounded w-full" />
                    <div className="h-4 bg-muted/40 rounded w-4/5" />
                    <div className="h-3 bg-muted/40 rounded w-1/2 mt-2" />
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground w-full min-w-[20rem]">
              <p>No news articles found for this filter.</p>
              <Button variant="ghost" onClick={() => setActiveTag(null)}>Clear filter</Button>
            </div>
          )}
        </div>
      </div>

      {/* Footer Disclaimer */}
      <div className="mt-16 pt-8 border-t border-border/50 grid grid-cols-1 lg:grid-cols-4 gap-8 text-[11px] text-muted-foreground/80 leading-relaxed">
        <div className="lg:col-span-3 space-y-4 pr-0 lg:pr-12">
          <p>
            Vanuatu Limited is registered and regulated by the Financial Services Commission of the Republic of Vanuatu under registration number 700270 and has its registered office at Law Partners House, Kumul Highway, Port Vila, Vanuatu.
          </p>
          <p>
            This website is operated by Vanuatu Limited.
          </p>
          <p>
            The entity above is duly authorized to operate under the FxTrusts brand and trademarks.
          </p>
          <p>
            Risk Warning: Online Forex/CFDs are complex instruments and come with a high risk of losing money rapidly due to leverage. You should consider whether you understand how CFDs work and whether you can afford to take the high risk of losing your money. Under no circumstances shall FxTrusts have any liability to any person or entity for any loss or damage in whole or part caused by, resulting from, or relating to any financial activity. <a href="#" className="text-[#3366FF] hover:underline">Learn more</a>
          </p>
          <p>
            The information on this website may only be copied with the express written permission of FxTrusts.
          </p>
          <p>
            FxTrusts complies with the Payment Card Industry Data Security Standard (PCI DSS) to ensure your security and privacy. We conduct regular vulnerability scans and penetration tests in accordance with the PCI DSS requirements for our business model.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <a href="#" className="text-[#3366FF] hover:underline">Client Agreement</a>
          <a href="#" className="text-[#3366FF] hover:underline">General Business Terms</a>
          <a href="#" className="text-[#3366FF] hover:underline">Partnership Agreement</a>
          <a href="#" className="text-[#3366FF] hover:underline">Bonus Terms and Conditions</a>
          <a href="#" className="text-[#3366FF] hover:underline">Complaints Procedure for Clients</a>
          <a href="#" className="text-[#3366FF] hover:underline">Risk disclosure</a>
          <a href="#" className="text-[#3366FF] hover:underline">Preventing Money Laundering</a>
          <a href="#" className="text-[#3366FF] hover:underline">Security Instructions</a>
          <a href="#" className="text-[#3366FF] hover:underline">Privacy Agreement</a>
          <a href="#" className="text-[#3366FF] hover:underline">Key Facts Statement</a>
          <a href="#" className="text-[#3366FF] hover:underline">Contact</a>
        </div>
        <div className="lg:col-span-4 mt-4 text-[10px]">
          <p>© 2008 - 2026. FxTrusts</p>
        </div>
      </div>

    </div>
  );
}
