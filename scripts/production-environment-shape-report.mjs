import { productionEnvironmentShapeReport, publicProductionEnvironmentShapeReport } from '../lib/job-agent-production-environment-report.js';

const report = productionEnvironmentShapeReport(process.env);
const output = process.argv.includes('--summary') ? publicProductionEnvironmentShapeReport(report) : report;

console.log(JSON.stringify(output, null, process.argv.includes('--summary') ? 0 : 2));
