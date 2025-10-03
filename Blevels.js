const predef = require("./tools/predef");
const { px, du, op } = require("./tools/graphics");


const defaultLevelText =
"PDH , 24913.5\nPDL / yNYL, 24627\nPDC, 24831.5\nyNYH, 24899.25\nGX H, 24793.5\nGX L , 24694.25\nBB H, 25131\nBB L, 23456\nD20, 24293\nD5, 24797\nyVAH, 24800.75\nyPOC , 24724.5\nyVAL, 24630\nMon.H ETH/RTH, 25027.25\nMon.L, 24748.75\nPDL / Tue.L - RTH, 24780.5\nMon.L - RTH, 24814.25\nPW VAH, 24742\nPW POC, 24537\nPW VAL, 24322.75\nPW H, 24888\nPW L , 24242";


class sethlement {
    init() {
        //NYO
        this.nyoPrice = null;
        //IB
        this.ibHigh = null;
        this.ibLow = null;


        // Parse hardcoded text
        this.levels = [];
        const lines = defaultLevelText.split('\n');
        for (let line of lines) {
            const parts = line.split(',').map(s => s.trim());
            if (parts.length === 2) {
                const label = parts[0];
                const price = parseFloat(parts[1].replace(/,/g, ""));
                if (!isNaN(price)) {
                    this.levels.push({ label, price });
                }
            }
        }
    }


    map(d,i,history) {
        const items = [];
        //NYO
        const timestamp = d.timestamp();
        const hour = timestamp.getHours();
        const minute = timestamp.getMinutes();
        const price = d.close();


        if (hour === this.props.NYOHour && minute === this.props.NYOMinute) { //Cash Open
            this.nyoPrice = d.open();// update NYO price
            //reset IB
            this.nyoTimestamp = timestamp;
            this.nyoIndex = d.index();
            this.ibHigh = null;
            this.ibLow = null;


            // Reset VWAP accumulation
            this.volumeSum = 0;
            this.volumePriceSum = 0;
        }  


        // At exactly 1 hour later: calculate IBH and IBL           
        if ( hour === ((this.props.NYOHour + 1) % 24) && minute === this.props.NYOMinute) {
            const currentIndex = d.index();
            const bars = [];


            //collect bars in the last 60 mins
            for (let j = 1; j <= i; j++) {
                const bar = history.get(i - j); // look back from current index
                if (!bar) break;


                const ts = bar.timestamp();
                const delta = (timestamp - ts) / 60000; // minutes ago


                if (delta <= 60) {
                    bars.push(bar);
                } else {
                    break;
                }
            }




            //Record the high and low of the range
            if (bars.length > 0) {
                this.ibHigh = Math.max(...bars.map(b => b.high()));
                this.ibLow = Math.min(...bars.map(b => b.low()));
            }
        }


        //AVWAP
        //Accumulate
        const vol = d.volume();
        const typical = (d.high() + d.low() + d.close()) / 3;


        this.volumeSum = (this.volumeSum || 0) + vol;
        this.volumePriceSum = (this.volumePriceSum || 0) + (vol * typical);
        //Calc
        let vwap = null;
        if (this.volumeSum > 0) {
            vwap = this.volumePriceSum / this.volumeSum;
        }




       
        if (d.isLast()) {
            //NYO
            if (this.nyoPrice !== null) {
                items.push({
                    tag: 'Text',
                    key: `label-NYO`,
                    point: {
                        x: du(d.index() + 10),
                        y: du(this.nyoPrice)
                    },
                    text: `NYO ${this.nyoPrice}`,
                    style: {
                        fontSize: 12,
                        fontWeight: "bold",
                        fill: "#FF6666"
                    },
                    textAlignment: "rightMiddle",
                    global: true
                });
            }
            //IB Labels
            if (this.ibHigh && this.ibLow) {
                items.push({
                    tag: 'Text',
                    key: 'label-IBH',
                    point: { x: du(d.index() + 10), y: du(this.ibHigh) },
                    text: `IBH ${this.ibHigh}`,
                    style: { fontSize: 12, fontWeight: "bold", fill: "#00FFAA" },
                    textAlignment: "rightMiddle",
                    global: true
                });


                items.push({
                    tag: 'Text',
                    key: 'label-IBL',
                    point: { x: du(d.index() + 10), y: du(this.ibLow) },
                    text: `IBL ${this.ibLow}`,
                    style: { fontSize: 12, fontWeight: "bold", fill: "#FF66AA" },
                    textAlignment: "rightMiddle",
                    global: true
                });
            }


            // VWAP Label
            if (vwap !== null) {
                items.push({
                    tag: 'Text',
                    key: `label-NYVWAP`,
                    point: { x: du(d.index() + 10), y: du(vwap) },
                    text: `NYVWAP ${vwap.toFixed(2)}`,
                    style: { fontSize: 12, fontWeight: "bold", fill: "#6699FF" },
                    textAlignment: "rightMiddle",
                    global: true
                });
            }




            //Static Labels
            for (const level of this.levels) {
                items.push({
                    tag: 'Text',
                    key: `label-${level.label}-${level.price}`,
                    point: {
                        x: du(d.index() + this.props.LabelOffset),
                        y: du(level.price)
                    },
                    text: `${level.label} ${level.price}`,
                    style: {
                        fontSize: 12,
                        fontWeight: "bold",
                        fill: "#FFD700"
                    },
                    textAlignment: "rightMiddle",
                    global: true
                });
            }
        }


        return {
            graphics: { items },
            vwapLine: vwap
        };
    }
}


module.exports = {
    name: "BLevels3",
    description: "B Levels desc4",
    calculator: sethlement,
    params: {
        NYOHour: predef.paramSpecs.number(21, 1, 0),
        NYOMinute: predef.paramSpecs.number(30, 1, 0),
        LabelOffset: predef.paramSpecs.number(50, 1, 0)
    },
    tags: ["C"],
    plots: {
        vwapLine: { title: "VWAP" }
    },
    plotter: [
        predef.plotters.singleline("vwapLine")
    ],
    schemeStyles: {
        dark: { vwapLine: predef.styles.plot({ color: "#6699FF"})}
    }
};
