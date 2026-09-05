import { prisma } from "@/server/db/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { BudgetStatus } from "@prisma/client";

export default async function BudgetsPage() {
  const budgets = await prisma.budget.findMany({
    orderBy: { periodStart: "desc" },
    include: {
      responsibleUser: { select: { name: true } }
    }
  });

  const getStatusColor = (status: BudgetStatus) => {
    switch (status) {
      case "DRAFT": return "bg-slate-100 text-slate-800";
      case "CONFIRMED": return "bg-emerald-100 text-emerald-800";
      case "REVISED": return "bg-blue-100 text-blue-800";
      case "CANCELLED": return "bg-rose-100 text-rose-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-emerald-900">Budgets</h1>
        <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
          <Link href="/budgets/new">
            <Plus className="mr-2 h-4 w-4" /> New Budget
          </Link>
        </Button>
      </div>

      <Card className="border-emerald-100 shadow-sm">
        <CardHeader className="bg-emerald-50/50 border-b border-emerald-100 pb-4">
          <CardTitle className="text-emerald-800">All Budgets</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-emerald-50/30">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Period Start</TableHead>
                <TableHead>Period End</TableHead>
                <TableHead>Responsible</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgets.map((budget) => (
                <TableRow key={budget.id} className="hover:bg-emerald-50/20">
                  <TableCell className="font-medium text-emerald-900">{budget.name}</TableCell>
                  <TableCell className="text-muted-foreground">{format(budget.periodStart, "dd MMM yyyy")}</TableCell>
                  <TableCell className="text-muted-foreground">{format(budget.periodEnd, "dd MMM yyyy")}</TableCell>
                  <TableCell className="text-muted-foreground">{budget.responsibleUser?.name || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`border-0 ${getStatusColor(budget.status)}`}>
                      {budget.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100">
                      <Link href={`/budgets/${budget.id}`}>View Details</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {budgets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No budgets found. Create one to start tracking expenditures.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
