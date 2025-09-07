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

module.exports = {
    name: "FZT momo",
    description: "FZT momo",
    calculator: FZTMomo,
    params: {},
    plots:{
        ema13: { title: "ema13" },
        ema21: { title: "ema21" },
        ema34: { title: "ema34" }
    }
    tags: ["FZT"],
    schemeStyles: {
        ema13: predef.styles.solidLine("#9B9B9B"), // gray
        ema21: predef.styles.solidLine("#50E3C2"), // teal
        ema34: predef.styles.solidLine("#7A92F5")  // blue
    }
};
