# data.js 다시 만들기. 사용법: dl 폴더에 아래 파일을 받아두고 실행
#  FRED csv: FEDFUNDS, IRSTCI01KRM156N, DGS10, IRLTLT01KRM156N, DEXKOUS  (https://fred.stlouisfed.org/graph/fredgraph.csv?id=ID)
#  Yahoo 월봉 json: y_DX-Y.NYB, y_%5EDJI, y_%5EIXIC, y_%5EKS11, y_%5EKQ11  (query1.finance.yahoo.com/v8/finance/chart/SYM?interval=1mo&range=max)
#  IMF: imfall.json  (https://www.imf.org/external/datamapper/api/v1/PCPIPCH)
$out = if ($args[0]) { $args[0] } else { Join-Path $PSScriptRoot "data.js" }
$d = if ($args[1]) { $args[1] } else { Join-Path $PSScriptRoot "dl" }
$Y0 = 1997; $Y1 = 2026
$ci = [Globalization.CultureInfo]::InvariantCulture

# FRED csv -> last valid obs per year
function FredYE($id) {
  $h = @{}; $last = @{}
  foreach ($line in (Get-Content "$d\$id.csv" | Select-Object -Skip 1)) {
    $p = $line.Split(','); if ($p.Count -lt 2 -or $p[1] -eq '' -or $p[1] -eq '.') { continue }
    $y = [int]$p[0].Substring(0,4); $h[$y] = [double]::Parse($p[1], $ci); $last[$y] = $p[0]
  }
  return @($h, $last)
}
function YahooYE($sym) {
  $j = Get-Content "$d\y_$sym.json" -Raw | ConvertFrom-Json
  $r = $j.chart.result[0]; $ts = $r.timestamp; $c = $r.indicators.quote[0].close
  $h = @{}; $last = @{}
  for ($i = 0; $i -lt $ts.Count; $i++) {
    if ($c[$i] -eq $null) { continue }
    $dt = [DateTimeOffset]::FromUnixTimeSeconds([long]$ts[$i]).UtcDateTime.AddHours(12)
    $h[$dt.Year] = [double]$c[$i]; $last[$dt.Year] = $dt.ToString('yyyy-MM')
  }
  return @($h, $last)
}
$series = [ordered]@{
  usRate = FredYE 'FEDFUNDS'
  krRate = FredYE 'IRSTCI01KRM156N'
  us10y  = FredYE 'DGS10'
  kr10y  = FredYE 'IRLTLT01KRM156N'
  krw    = FredYE 'DEXKOUS'
  dxy    = YahooYE 'DX-Y.NYB'
  dow    = YahooYE '%5EDJI'
  nasdaq = YahooYE '%5EIXIC'
  kospi  = YahooYE '%5EKS11'
  kosdaq = YahooYE '%5EKQ11'
}
$sb = New-Object Text.StringBuilder
[void]$sb.AppendLine("// 자동 생성: 연말(마지막 관측치) 기준. 2026은 최신 관측치. 출처: FRED, Yahoo Finance, IMF WEO")
[void]$sb.AppendLine("const MACRO_YEARS = [" + (($Y0..$Y1) -join ',') + "];")
[void]$sb.AppendLine("const MACRO = {")
$asof = @{}
foreach ($k in $series.Keys) {
  $h = $series[$k][0]; $last = $series[$k][1]
  $vals = foreach ($y in $Y0..$Y1) { if ($h.ContainsKey($y)) { [Math]::Round($h[$y], 2).ToString($ci) } else { 'null' } }
  [void]$sb.AppendLine("  ${k}: [" + ($vals -join ',') + "],")
  $asof[$k] = $last[$Y1]
}
[void]$sb.AppendLine("};")
[void]$sb.AppendLine("const MACRO_ASOF = {" + (($asof.Keys | % { "${_}: '$($asof[$_])'" }) -join ', ') + "};")

# IMF inflation
$t = Get-Content "$d\imfall.json" -Raw
[void]$sb.AppendLine("// IMF WEO 소비자물가 상승률(연평균, %). 2026년 이후는 IMF 전망치")
[void]$sb.AppendLine("const IMF_CPI = {")
foreach ($c in 'USA','KOR','WEOWORLD','ADVEC','CHN','JPN','EURO') {
  $m = [regex]::Match($t, '"' + $c + '":\{([^}]*)\}')
  [void]$sb.AppendLine("  ${c}: {" + $m.Groups[1].Value + "},")
}
[void]$sb.AppendLine("};")
[IO.File]::WriteAllText($out, $sb.ToString(), (New-Object Text.UTF8Encoding($false)))
Get-Content $out
