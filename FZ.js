const predef = require("./tools/predef");
const EMA = require("./tools/EMA");

class FZTMomo {
    init() {
        this.ema13 = EMA(13);
        this.ema21 = EMA(21);
        this.ema34 = EMA(34);
    }

    map(d) {
        return {
            ema13: this.ema13(d.value()),
            ema21: this.ema21(d.value()),
            ema34: this.ema34(d.value())
        };
    }

    filter(_, i) {
        return i >= 34; // wait until the longest EMA has enough bars
    }
}

// Build schemeStyles by merging dark/light per-plot maps
const s13 = predef.styles.solidLine("ema13", "#9B9B9B"); // gray
const s21 = predef.styles.solidLine("ema21", "#50E3C2"); // teal
const s34 = predef.styles.solidLine("ema34", "#7A92F5"); // blue

const schemeStyles = {
    dark: { ...s13.dark, ...s21.dark, ...s34.dark },
    light: { ...s13.light, ...s21.light, ...s34.light }
};

module.exports = {
    name: "FZT momo",
    description: "FZT momo",
    calculator: FZTMomo,
    params: {},
    plots: {
        ema13: { title: "ema13" },
        ema21: { title: "ema21" },
        ema34: { title: "ema34" }
    },
    // Optional: render as a grouped multiline plot
    // plotter: predef.plotters.multiline(["ema13", "ema21", "ema34"]),
    tags: ["FZT"],
    schemeStyles
};
