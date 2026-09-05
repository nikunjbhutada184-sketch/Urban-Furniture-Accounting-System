"use client";

import { useTransition, useState } from "react";
import { createBudgetAction, reviseBudgetAction } from "@/modules/budgets/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";

type User = { id: string; name: string };
type AnalyticAccount = { id: string; name: string; type: string };

export function BudgetForm({ 
  users, 
  analyticAccounts,
  initialData 
}: { 
  users: User[], 
  analyticAccounts: AnalyticAccount[],
  initialData?: {
    name: string;
    periodStart: Date;
    periodEnd: Date;
    responsibleUserId?: string | null;
    lines: { analyticAccountId: string; plannedAmount: number }[];
    isRevision?: boolean;
    budgetId?: string;
  }
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  
  const defaultLines = initialData?.lines?.map((l, i) => ({
    id: Date.now() + i,
    analyticAccountId: l.analyticAccountId,
    plannedAmount: l.plannedAmount
  })) || [{ id: Date.now(), analyticAccountId: "", plannedAmount: 0 }];

  const [lines, setLines] = useState(defaultLines);

  const addLine = () => setLines([...lines, { id: Date.now(), analyticAccountId: "", plannedAmount: 0 }]);
  const removeLine = (id: number) => setLines(lines.filter(l => l.id !== id));
  
  const updateLine = (id: number, field: string, value: string | number) => {
    setLines(lines.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    
    if (lines.length === 0 || lines.some(l => !l.analyticAccountId)) {
      setError("Please add at least one valid budget line.");
      return;
    }

    startTransition(async () => {
      const budgetLines = lines.map(l => ({
        analyticAccountId: l.analyticAccountId,
        plannedAmount: Number(l.plannedAmount),
      }));

      let result;
      if (initialData?.isRevision && initialData.budgetId) {
        result = await reviseBudgetAction({
          id: initialData.budgetId,
          lines: budgetLines,
        });
      } else {
        result = await createBudgetAction({
          name: formData.get("name") as string,
          periodStart: new Date(formData.get("periodStart") as string),
          periodEnd: new Date(formData.get("periodEnd") as string),
          responsibleUserId: formData.get("responsibleUserId") as string,
          lines: budgetLines,
        });
      }

      if (!result.success && 'error' in result) {
        setError(result.error || "Failed to save budget");
      } else {
        router.push("/budgets");
        router.refresh();
      }
    });
  }

  return (
    <Card className="max-w-4xl mx-auto border-emerald-100 shadow-sm">
      <CardHeader className="bg-emerald-50/50 border-b border-emerald-100">
        <CardTitle className="text-emerald-800">New Budget</CardTitle>
        <CardDescription>
          Plan expenditures and income across analytic accounts for a specific period.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-8">
          {error && <div className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}
          
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="name">Budget Name</Label>
              <Input id="name" name="name" required className="border-emerald-200 focus-visible:ring-emerald-500" placeholder="e.g. Q3 2026 Marketing" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="periodStart">Period Start</Label>
              <Input id="periodStart" name="periodStart" type="date" required className="border-emerald-200 focus-visible:ring-emerald-500" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="periodEnd">Period End</Label>
              <Input id="periodEnd" name="periodEnd" type="date" required className="border-emerald-200 focus-visible:ring-emerald-500" />
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="responsibleUserId">Responsible Person</Label>
              <Select name="responsibleUserId">
                <SelectTrigger className="border-emerald-200 focus:ring-emerald-500">
                  <SelectValue placeholder="Select a user (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-emerald-100 pb-2">
              <h3 className="text-lg font-medium text-emerald-900">Budget Lines</h3>
              <Button type="button" onClick={addLine} variant="outline" size="sm" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                <Plus className="h-4 w-4 mr-2" /> Add Line
              </Button>
            </div>
            
            {lines.map((line, index) => (
              <div key={line.id} className="flex gap-4 items-end bg-emerald-50/30 p-4 rounded-md border border-emerald-100/50">
                <div className="flex-1 space-y-2">
                  <Label>Analytic Account</Label>
                  <Select value={line.analyticAccountId} onValueChange={(val) => updateLine(line.id, "analyticAccountId", val)}>
                    <SelectTrigger className="border-emerald-200 bg-white">
                      <SelectValue placeholder="Select Account" />
                    </SelectTrigger>
                    <SelectContent>
                      {analyticAccounts.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name} ({a.type})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="w-1/3 space-y-2">
                  <Label>Planned Amount (Rs.)</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={line.plannedAmount || ""} 
                    onChange={(e) => updateLine(line.id, "plannedAmount", parseFloat(e.target.value) || 0)}
                    className="border-emerald-200 bg-white" 
                    required 
                  />
                </div>

                <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(line.id)} className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 mb-0.5">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t border-emerald-100">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {isPending ? "Creating..." : "Create Budget"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
