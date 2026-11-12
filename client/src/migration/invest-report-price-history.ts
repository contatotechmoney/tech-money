const exampleCloses = [
  945, 918, 932, 901, 884, 915, 944, 970, 954, 977, 1002, 984, 965,
  940, 910, 882, 856, 812, 793, 824, 847, 831, 868, 898, 880, 922,
  947, 932, 975, 989, 1013, 987, 1006, 1044, 1030, 1068, 1048, 1012, 1038,
  1074, 1090, 1073, 1112, 1089, 1104, 1132, 1118, 1150, 1124, 1140, 1168, 1155,
];

const horizonCloses = [
  1372, 1345, 1378, 1309, 1280, 1321, 1356, 1409, 1390, 1427, 1468, 1430, 1406,
  1364, 1324, 1274, 1198, 1170, 1128, 1165, 1208, 1186, 1236, 1282, 1261, 1302,
  1338, 1316, 1371, 1390, 1452, 1420, 1447, 1492, 1480, 1536, 1509, 1469, 1494,
  1548, 1577, 1552, 1609, 1588, 1612, 1640, 1620, 1674, 1648, 1662, 1696, 1680,
];

const weekMs = 7 * 24 * 60 * 60 * 1000;

export function priceHistoryFor(ticker: string, reportIso: string) {
  const closes = ticker === "HORIZ3" ? horizonCloses : exampleCloses;
  const reportDate = Date.parse(reportIso);
  return closes.map((closeCents, index) => ({
    closeCents,
    date: new Date(reportDate - (closes.length - index - 1) * weekMs).toISOString().slice(0, 10),
  }));
}
