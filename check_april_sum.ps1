
$json = Get-Content "public/src/doc/alborada-pagos/CSV_a_JSON_pagos/abril2025.json" -Raw | ConvertFrom-Json
$others = $json | Where-Object { $_.type -ne 'FEE' }
$incomes = $others | Where-Object { $_.amount -gt 0 }
$expenses = $others | Where-Object { $_.amount -lt 0 }

$totalIn = 0; foreach($i in $incomes) { $totalIn += $i.amount }
$totalEx = 0; foreach($e in $expenses) { $totalEx += $e.amount }

Write-Output "Registros Totales: $($json.Count)"
Write-Output "Ingresos (Pagos): $totalIn"
Write-Output "Gastos (Créditos): $totalEx"
Write-Output "Neto del Mes: $($totalIn + $totalEx)"
