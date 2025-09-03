const predef = require("./tools/predef");
const { px, du, op } = require("./tools/graphics");


const defaultLevelText =
"PDH/Mon.H, 23552.5\nPDLTue.L, 23027\nPDC, 23277\nyNYH, 23509.5\nyNYL, 23060.25\nBB H, 24049.5\nBB L, 23113\nD20, 23581.25\nyVAH, 23256\nyPOC, 23211.25\nyVAL, 23106.5\nPW VAH, 23611.5\nPW POC / D5, 23543.25\nPW VAL, 23438.5\nPW H, 23803.75\nPW L /W35-1 Tue.L, 23370.5\nPM H, 24068.5\nPM L, 22774.75\nW33 VA L, 23757.25\nW33 POC, 23933.75\nW33 VA H, 23968";


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
       if (
            this.nyoTimestamp &&
            timestamp.getTime() - this.nyoTimestamp.getTime() >= 60 * 60 * 1000 &&
            this.ibHigh === null
        ) {
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
                        x: du(d.index() + 10),
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
        NYOMinute: predef.paramSpecs.number(30, 1, 0)
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
