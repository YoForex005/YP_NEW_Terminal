"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  Calendar, 
  Search, 
  Filter, 
  AlertCircle, 
  Info, 
  Globe, 
  Loader2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format, parseISO, isSameDay, addDays, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";

interface EconomicEvent {
  eventId: string;
  date: string;
  title: string;
  event: string;
  currency: string;
  country: string;
  actual: string;
  forecast: string;
  previous: string;
  impact: string;
  source: string;
}

export function EconomicCalendarDashboard() {
  const [data, setData] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [impactFilter, setImpactFilter] = useState<string>("All");
  const [currencyFilter, setCurrencyFilter] = useState<string>("All");
  const [dateFilter, setDateFilter] = useState<string>("All");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch("https://backend.yoforexai.com/economic-calendar/live?days=7");
        if (!response.ok) {
          throw new Error("Failed to fetch economic calendar data");
        }
        const result = await response.json();
        setData(result);
        setError(null);
      } catch (err) {
        console.error("Error fetching economic calendar:", err);
        setError("Unable to load economic calendar. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const uniqueCurrencies = useMemo(() => {
    const currencies = Array.from(new Set(data.map((item) => item.currency)));
    return ["All", ...currencies.sort()];
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const matchesSearch = item.event.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           item.currency.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesImpact = impactFilter === "All" || item.impact === impactFilter;
      const matchesCurrency = currencyFilter === "All" || item.currency === currencyFilter;
      
      let matchesDate = true;
      const eventDate = parseISO(item.date);
      const today = new Date();

      if (dateFilter === "Today") {
        matchesDate = isSameDay(eventDate, today);
      } else if (dateFilter === "Tomorrow") {
        matchesDate = isSameDay(eventDate, addDays(today, 1));
      } else if (dateFilter === "This Week") {
        matchesDate = isWithinInterval(eventDate, {
          start: startOfWeek(today),
          end: endOfWeek(today)
        });
      }

      return matchesSearch && matchesImpact && matchesCurrency && matchesDate;
    });
  }, [data, searchTerm, impactFilter, currencyFilter, dateFilter]);

  const getImpactColor = (impact: string) => {
    switch (impact.toLowerCase()) {
      case "high":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "medium":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "low":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "holiday":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const getImpactIndicator = (impact: string) => {
    const levels = { high: 3, medium: 2, low: 1, holiday: 0 };
    const level = (levels as any)[impact.toLowerCase()] || 0;
    
    return (
      <div className="flex gap-0.5 items-center">
        {[1, 2, 3].map((i) => (
          <div 
            key={i} 
            className={cn(
              "w-1 h-3 rounded-full",
              i <= level 
                ? (impact.toLowerCase() === 'high' ? 'bg-red-500' : impact.toLowerCase() === 'medium' ? 'bg-orange-500' : 'bg-primary') 
                : "bg-muted-foreground/20"
            )}
          />
        ))}
      </div>
    );
  };

  if (error) {
    return (
      <Card className="border-red-500/20 bg-red-500/5">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h3 className="text-xl font-bold text-red-500 mb-2">Service Unavailable</h3>
          <p className="text-muted-foreground max-w-md">{error}</p>
          <Button variant="outline" className="mt-6 border-red-500/20 hover:bg-red-500/10" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto p-4 sm:p-6 pb-20">
      <div className="flex flex-col gap-6 overflow-hidden">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-bold flex items-center gap-2 text-foreground">
                <Calendar className="h-6 w-6 text-[#16A249]" />
                Live Economic Calendar
              </h2>
              <p className="text-muted-foreground text-sm">
                Real-time updates from major global economies
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search events or currency..."
                  className="pl-9 h-10 bg-background/50 border-border/50 rounded-full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-10 border-border/50 rounded-full gap-2 bg-background/50">
                    <Filter className="h-4 w-4" />
                    Impact: {impactFilter}
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 bg-card border-border/50">
                  {["All", "High", "Medium", "Low"].map((impact) => (
                    <DropdownMenuItem 
                      key={impact} 
                      onClick={() => setImpactFilter(impact)}
                      className="cursor-pointer"
                    >
                      {impact}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-10 border-border/50 rounded-full gap-2 bg-background/50">
                    <Globe className="h-4 w-4" />
                    {currencyFilter === "All" ? "Currency" : currencyFilter}
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 max-h-60 overflow-y-auto bg-card border-border/50">
                  {uniqueCurrencies.map((curr) => (
                    <DropdownMenuItem 
                      key={curr} 
                      onClick={() => setCurrencyFilter(curr)}
                      className="cursor-pointer"
                    >
                      {curr}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            {["All", "Today", "Tomorrow", "This Week"].map((filter) => (
              <Button
                key={filter}
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-full px-5 text-sm font-medium transition-colors border",
                  dateFilter === filter 
                    ? "bg-[#16A249] hover:bg-[#16A249]/90 text-white border-[#16A249]" 
                    : "bg-transparent hover:bg-muted text-muted-foreground border-border/40"
                )}
                onClick={() => setDateFilter(filter)}
              >
                {filter}
              </Button>
            ))}
          </div>
        </div>
        
        <div className="w-full">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="border-b border-border/30 hover:bg-transparent">
                <TableRow className="border-b border-border/30 hover:bg-transparent">
                  <TableHead className="w-[120px] font-bold text-muted-foreground text-xs uppercase tracking-wider">Time (UTC)</TableHead>
                  <TableHead className="w-[80px] font-bold text-muted-foreground text-xs uppercase tracking-wider">Cur.</TableHead>
                  <TableHead className="w-[100px] font-bold text-muted-foreground text-xs uppercase tracking-wider">Impact</TableHead>
                  <TableHead className="font-bold text-muted-foreground text-xs uppercase tracking-wider">Event</TableHead>
                  <TableHead className="text-right font-bold text-muted-foreground text-xs uppercase tracking-wider">Actual</TableHead>
                  <TableHead className="text-right font-bold text-muted-foreground text-xs uppercase tracking-wider">Forecast</TableHead>
                  <TableHead className="text-right font-bold text-muted-foreground text-xs uppercase tracking-wider">Previous</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i} className="animate-pulse">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-muted/60 rounded w-full"></div>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredData.length > 0 ? (
                  filteredData.map((event) => {
                    const isExpanded = expandedEventId === event.eventId;
                    return (
                      <>
                        <TableRow 
                          key={event.eventId} 
                          className={cn(
                            "cursor-pointer hover:bg-muted/30 transition-colors border-border/30",
                            isExpanded && "bg-muted/40"
                          )}
                          onClick={() => setExpandedEventId(isExpanded ? null : event.eventId)}
                        >
                          <TableCell className="font-mono text-sm text-muted-foreground">
                            {format(parseISO(event.date), "HH:mm")}
                            <div className="text-[10px] text-muted-foreground/60">{format(parseISO(event.date), "MMM dd")}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 font-bold">
                              <span className="text-xs">{event.currency}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {getImpactIndicator(event.impact)}
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2 group">
                              {event.event}
                              <Info className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </TableCell>
                          <TableCell className={cn(
                            "text-right font-bold",
                            event.actual !== "-" && "text-primary"
                          )}>
                            {event.actual}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {event.forecast}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {event.previous}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="bg-muted/20 border-border/30">
                            <TableCell colSpan={7} className="p-0">
                              <div className="p-4 flex flex-col gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                  <div className="space-y-2">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Event Details</h4>
                                    <p className="text-sm">{event.title}</p>
                                    <div className="flex items-center gap-2">
                                    <Badge variant="success" className={cn("text-[10px] border", getImpactColor(event.impact))}>
                                        {event.impact} Impact
                                    </Badge>
                                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {format(parseISO(event.date), "PPP p")}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Market Consensus</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="space-y-1">
                                        <p className="text-[10px] text-muted-foreground">Forecast</p>
                                        <p className="font-semibold">{event.forecast}</p>
                                      </div>
                                      <div className="space-y-1">
                                        <p className="text-[10px] text-muted-foreground">Previous</p>
                                        <p className="font-semibold">{event.previous}</p>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Source</h4>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium">{event.source}</span>
                                      <a href="#" target="_blank" rel="noopener noreferrer" className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-muted/60 text-muted-foreground transition-colors">
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="bg-muted/50 p-3 rounded-md text-[11px] text-muted-foreground border border-border/30">
                                  <p><strong>Note:</strong> Data is provided by {event.source}. The actual values are updated dynamically as they are released. Times are shown in your local time zone.</p>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Info className="h-8 w-8 opacity-20" />
                        <p>No economic events found matching your current filters.</p>
                        <Button 
                          variant="ghost" 
                          className="text-[#16A249] hover:bg-[#16A249]/10 hover:text-[#16A249]"
                          onClick={() => {
                            setSearchTerm("");
                            setImpactFilter("All");
                            setCurrencyFilter("All");
                            setDateFilter("All");
                          }}
                        >
                          Clear all filters
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
