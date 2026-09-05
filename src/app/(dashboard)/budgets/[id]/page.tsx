import { prisma } from "@/server/db/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Target, History } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { BudgetActions } from "./budget-actions";

export default async function BudgetDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const budget = await prisma.budget.findUnique({
    where: { id: params.id },
    include: {
      responsibleUser: { select: { name: true } },
      revisionOf: { select: { id: true, name: true } },
      revisedBy: { select: { id: true, name: true } },
      lines: {
        include: {
          analyticAccount: { select: { name: true, type: true } }
        }
      }
    }
  });

  if (!budget) notFound();

  let totalPlanned = 0;
  let totalAchieved = 0;

  const enrichedLines = budget.lines.map(line => {
    const planned = line.plannedAmount.toNumber();
    const achieved = line.achievedAmount.toNumber();
    const toAchieve = Math.max(0, planned - achieved);
    const achievedPercent = planned > 0 ? (achieved / planned) * 100 : 0;
    
    totalPlanned += planned;
    totalAchieved += achieved;

    return { ...line, planned, achieved, toAchieve, achievedPercent };
  });

  const totalAchievedPercent = totalPlanned > 0 ? (totalAchieved / totalPlanned) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="icon" asChild className="border-emerald-200 text-emerald-800 hover:bg-emerald-50">
            <Link href="/budgets">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-3xl font-bold tracking-tight text-emerald-900">{budget.name}</h1>
              <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">
                {budget.status}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 flex items-center">
              {format(budget.periodStart, "MMM d, yyyy")} - {format(budget.periodEnd, "MMM d, yyyy")}
              {budget.responsibleUser && <span className="ml-2">| Responsible: {budget.responsibleUser.name}</span>}
            </p>
          </div>
        </div>
        
        <BudgetActions budgetId={budget.id} status={budget.status} />
      </div>

      {(budget.revisionOf || budget.revisedBy) && (
        <Card className="bg-blue-50/50 border-blue-100">
          <CardContent className="p-4 flex items-center space-x-2 text-sm text-blue-800">
            <History className="h-4 w-4" />
            <span>
              {budget.revisionOf && (
                <>Revision of <Link href={`/budgets/${budget.revisionOf.id}`} className="font-semibold hover:underline">{budget.revisionOf.name}</Link>. </>
              )}
              {budget.revisedBy && (
                <>Superseded by <Link href={`/budgets/${budget.revisedBy.id}`} className="font-semibold hover:underline">{budget.revisedBy.name}</Link>.</>
              )}
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-emerald-100 shadow-sm">
          <CardHeader className="bg-emerald-50/50 border-b border-emerald-100 pb-4">
            <CardTitle className="text-emerald-800 text-sm font-medium">Total Planned (Committed)</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-emerald-900">Rs. {totalPlanned.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-100 shadow-sm">
          <CardHeader className="bg-emerald-50/50 border-b border-emerald-100 pb-4">
            <CardTitle className="text-emerald-800 text-sm font-medium">Total Achieved</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-emerald-900">Rs. {totalAchieved.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalAchievedPercent.toFixed(1)}% of planned
            </p>
          </CardContent>
        </Card>
        <Card className="border-emerald-100 shadow-sm">
          <CardHeader className="bg-emerald-50/50 border-b border-emerald-100 pb-4">
            <CardTitle className="text-emerald-800 text-sm font-medium">Total To Achieve</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-emerald-900">Rs. {Math.max(0, totalPlanned - totalAchieved).toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-emerald-100 shadow-sm">
        <CardHeader className="bg-emerald-50/50 border-b border-emerald-100 pb-4">
          <CardTitle className="text-emerald-800 flex items-center">
            <Target className="h-5 w-5 mr-2 text-emerald-600" /> Budget Lines
          </CardTitle>
          <CardDescription>Breakdown by Analytic Account.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-emerald-50/30">
              <TableRow>
                <TableHead>Analytic Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Planned (Committed)</TableHead>
                <TableHead className="text-right">Achieved</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">To Achieve</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrichedLines.map((line) => (
                <TableRow key={line.id} className="hover:bg-emerald-50/20">
                  <TableCell className="font-medium text-emerald-900">{line.analyticAccount.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-slate-200">
                      {line.analyticAccount.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">Rs. {line.planned.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-medium">Rs. {line.achieved.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{line.achievedPercent.toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-muted-foreground">Rs. {line.toAchieve.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="link" size="sm" asChild className="text-emerald-600">
                      <Link href={`/analytic/${line.analyticAccountId}`}>View Tx</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {enrichedLines.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No lines in this budget.
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
