"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { FundProps } from "./fund-card";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface CreateFundFormProps {
    onSubmit: (fund: Omit<FundProps, "id" | "minInvestment" | "lockInPeriod" | "nav">) => void;
    onCancel: () => void;
}

export function CreateFundForm({ onSubmit, onCancel }: CreateFundFormProps) {
    const [formData, setFormData] = useState({
        name: "",
        manager: "",
        risk: "LOW" as "LOW" | "MEDIUM" | "HIGH",
        performanceFee: "20",
        managementFee: "2",
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({
            name: formData.name,
            manager: formData.manager,
            risk: formData.risk,
            totalReturn: 0,
            maxDrawdown: 0,
            investors: 0,
            aum: 0,
            performanceFee: Number(formData.performanceFee),
            managementFee: Number(formData.managementFee),
        });
    };

    return (
        <Card className="max-w-2xl mx-auto border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
                <CardTitle>Create Your Fund</CardTitle>
                <CardDescription>
                    Set up your fund details to start attracting investors.
                </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Fund Name</Label>
                        <Input
                            id="name"
                            placeholder="e.g. Alpha Quant Strategy"
                            required
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="manager">Manager Name</Label>
                        <Input
                            id="manager"
                            placeholder="Your Name or Firm Name"
                            required
                            value={formData.manager}
                            onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="risk">Target Risk Level</Label>
                            <Select
                                value={formData.risk}
                                onValueChange={(value: any) => setFormData({ ...formData, risk: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="LOW">Low Risk</SelectItem>
                                    <SelectItem value="MEDIUM">Medium Risk</SelectItem>
                                    <SelectItem value="HIGH">High Risk</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            {/* Spacer or additional field */}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="perf-fee">Performance Fee (%)</Label>
                            <Input
                                id="perf-fee"
                                type="number"
                                min="0"
                                max="50"
                                step="0.5"
                                required
                                value={formData.performanceFee}
                                onChange={(e) => setFormData({ ...formData, performanceFee: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="mgmt-fee">Management Fee (%)</Label>
                            <Input
                                id="mgmt-fee"
                                type="number"
                                min="0"
                                max="10"
                                step="0.1"
                                required
                                value={formData.managementFee}
                                onChange={(e) => setFormData({ ...formData, managementFee: e.target.value })}
                            />
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-3 border-t border-border/50 pt-4">
                    <Button variant="outline" type="button" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button type="submit">
                        Create Fund
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}
