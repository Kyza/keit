export class Block {
	constructor({ pre, code, post } = {}) {
		this.pre = pre ?? (() => {});
		this.code = code ?? ((start, end) => (start(), end(), void 0));
		this.post = post ?? (() => {});
	}
}

const node = !!globalThis.process;

export const nanoseconds = node
	? () => {
			const hrTime = process.hrtime();
			return hrTime[0] * 1000000000 + hrTime[1];
	  }
	: () => {
			return performance.now() * 1000000;
	  };

export function benchmark(block = new Block()) {
	block.pre();
	const start = nanoseconds();
	const result = block.code();
	const time = nanoseconds() - start;
	block.post();
	return { time, result };
}

export async function simple(funcs = [], iterations = 1e3) {
	const blocks = funcs.reduce((acc, func) => {
		acc[func.toString()] = new Block({
			code: func,
		});
		return acc;
	}, {});
	const { results } = await keit({
		blocks,
		iterations,
		warning: false,
	});
	for (const name in results) {
		results[name].cold = results[name].cold.time;
		delete results[name].hot;
	}
	return results;
}

export default async function keit({
	blocks = { Nothing: new Block() },
	iterations = 1e3,
	emitter,
	warning = false,
	weight = 0.25,
} = {}) {
	if (warning && !node) console.warn(WARNING);

	const start = nanoseconds();

	const results = {};

	for (const [name, block] of Object.entries(blocks)) {
		if (!block instanceof Block) continue;

		// Get the cold run time for the code.
		// This is the first time the code is run.
		// It should be unoptimized for repeated runs.
		// This is what you want to look at when the code will be run once.
		const { time, result } = benchmark(block);
		results[name] = { cold: { time, result }, hot: [] };
		emitter && emitter.emit("COLD", { name, time, result });

		// Get the hot run times for the code.
		// These are the times right after the cold run time.
		// They should be optimized by the engine to run faster.
		// This is what you want to look at when the code will be run in a loop.
		for (let i = 0; i < iterations; i++) {
			const { time, result } = benchmark(block);
			results[name].hot.push({ time, result });
			emitter && emitter.emit("HOT", { name, time, result });
		}

		const hotTimes = results[name].hot.map((h) => h.time);
		const hotSum = hotTimes.reduce((acc, val) => acc + val, 0);
		const hotLength = results[name].hot.length;
		const weightedIterations = iterations * weight;

		// Get the average speed from just the hot times.
		results[name].averageHot = hotSum / hotLength;
		// Get the average speed from the hot times weighted by the cold time.
		results[name].average =
			(hotSum + results[name].cold.time * weightedIterations) /
			(hotLength + weightedIterations);

		// Get the fastest and slowest times and calculate the consistency for them.
		results[name].fastest = Math.min(...hotTimes, results[name].cold.time);
		results[name].slowest = Math.max(...hotTimes, results[name].cold.time);
		results[name].fastestHot = Math.min(...hotTimes);
		results[name].slowestHot = Math.max(...hotTimes);

		emitter &&
			emitter.emit("STATS", {
				name,
				averageHot: results[name].averageHot,
				average: results[name].average,
				fastest: results[name].fastest,
				slowest: results[name].slowest,
				fastestHot: results[name].fastestHot,
				slowestHot: results[name].slowestHot,
			});
	}

	// Once they're all finished they can be scored.
	for (const [name, result] of Object.entries(results)) {
		result.score = (result.average + result.slowest - result.fastest) * weight;
		result.score += result.averageHot + result.slowestHot - result.fastestHot;
		emitter && emitter.emit("SCORE", { name, score: results.score });
	}

	return { benchmarkTime: nanoseconds() - start, results };
}
