const predef = require("./tools/predef");
const { px, du, op } = require("./tools/graphics");

// Static price levels - update these as needed
const defaultLevelText = "PMH, 26120.25\nBBH, 26087.25\nWEH / WRH, 26045.50\nPPW VAH, 26016.50\nPDNH, 25936.50\nyVAH, 25920.00\nPPW POC / yPOC, 25884.75\nPDC / PWH, 25848.50\nyVAL, 25844.50\nPW VAH, 25828.00\nWRL, 25743.50\nPWC, 25738.25\nPMO, 25732.00\nyNL / PPW VAL, 25703.00\nPW POC, 25691.50\nD20, 25686.00\nWEL, 25632.75\nPDO, 25585.50\nD5, 25569.00\nPWO, 25471.00\nPMC, 25456.75\nPDL, 25365.25\nPW VAL, 25290.00\nBBL, 25284.50\nPWL, 25025.00\nPML, 24887.75";

// Configuration constants
const TYPICAL_PRICE_DIVISOR = 3;  // For HLC/3 typical price calculation
const MIN_VOLUME_THRESHOLD = 2;  // Minimum volume in last minute to consider market active
const SESSION_START_HOUR = 7;  // 1800 EST = 07:00 chart time
const SESSION_START_MINUTE = 0;
const GX_START_HOUR = 9;  // 2000 EST = 09:00 chart time (next day)
const GX_START_MINUTE = 0;
const GX_END_HOUR = 18;  // 0500 EST = 18:00 chart time (next day)
const GX_END_MINUTE = 0;


class sethlement {
    init() {
        // New York Open tracking
        this.nyoPrice = null;
        this.nyoTimestamp = null;
        this.nyoIndex = null;
        
        // Initial Balance range tracking
        this.ibHigh = null;
        this.ibLow = null;
        this.ibCollecting = false;  // Flag to track if we're in IB period
        
        // Yesterday's Initial Balance (preserved until new IB is set)
        this.yibHigh = null;
        this.yibLow = null;
        
        // Globex range tracking (0800 EST to 1700 EST)
        this.gxHigh = null;
        this.gxLow = null;
        this.gxCollecting = false;  // Flag to track if we're in GX period
        
        // Anchored VWAP calculation
        this.volumeSum = 0;
        this.volumePriceSum = 0;

        // Parse and store static price levels from configuration
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

    // Helper method to create label graphics objects
    createLabel(key, index, price, text, color, offset = 10) {
        return {
            tag: 'Text',
            key: key,
            point: {
                x: du(index + offset),
                y: du(price)
            },
            text: text,
            style: {
                fontSize: 12,
                fontWeight: "bold",
                fill: color
            },
            textAlignment: "rightMiddle",
            global: true
        };
    }

    // Helper method to format price based on hideDecimals setting
    formatPrice(price) {
        if (this.props.HideDecimals) {
            return Math.floor(price).toString();
        }
        return price.toString();
    }

    // Helper method to format VWAP (always 2 decimals)
    formatVWAP(price) {
        if (this.props.HideDecimals) {
            return Math.floor(price).toString();
        }
        return price.toFixed(2);
    }

    // Helper method to check if market is active by looking at recent volume
    isMarketActive(currentIndex, history, timestamp) {
        let totalVolume = 0;
        const minVolumeThreshold = 2;
        const lookbackMinutes = 1;
        
        for (let j = 0; j < 10; j++) {
            const bar = history.get(currentIndex - j);
            if (!bar) break;
            
            const barTimestamp = bar.timestamp();
            const minutesAgo = (timestamp - barTimestamp) / 60000;
            
            if (minutesAgo <= lookbackMinutes) {
                totalVolume += bar.volume();
            } else {
                break;
            }
        }
        
        return totalVolume > minVolumeThreshold;
    }

    // Convert hour and minute to comparable number (e.g., 9:30 -> 930)
    timeToNumber(hour, minute) {
        return +('' + hour + (minute < 10 ? '0' : '') + minute);
    }

    map(d, i, history) {
        const items = [];
        const timestamp = d.timestamp();
        const hour = timestamp.getHours();
        const minute = timestamp.getMinutes();
        const currentIndex = d.index();

        const currentTime = this.timeToNumber(hour, minute);
        const sessionStartTime = this.timeToNumber(SESSION_START_HOUR, SESSION_START_MINUTE);
        const nyoTime = this.timeToNumber(this.props.NYOHour, this.props.NYOMinute);
        const ibEndTime = this.timeToNumber((this.props.NYOHour + 1) % 24, this.props.NYOMinute);
        const gxStartTime = this.timeToNumber(GX_START_HOUR, GX_START_MINUTE);
        const gxEndTime = this.timeToNumber(GX_END_HOUR, GX_END_MINUTE);

        // Get prior bar for transition detection
        let priorTime = null;
        if (history.prior()) {
            const priorTimestamp = history.prior().timestamp();
            const priorHour = priorTimestamp.getHours();
            const priorMinute = priorTimestamp.getMinutes();
            priorTime = this.timeToNumber(priorHour, priorMinute);
        }

        // Detect GX start transition (0800 EST / 21:00 chart time)
        if (priorTime !== null && priorTime < gxStartTime && currentTime >= gxStartTime) {
            // Start collecting GX data
            this.gxCollecting = true;
            this.gxHigh = d.high();
            this.gxLow = d.low();
        }

        // During GX period, continuously update high/low
        if (this.gxCollecting) {
            if (d.high() > this.gxHigh) {
                this.gxHigh = d.high();
            }
            if (d.low() < this.gxLow) {
                this.gxLow = d.low();
            }
        }

        // Detect GX end transition (1700 EST / 06:00 chart time)
        if (priorTime !== null && priorTime < gxEndTime && currentTime >= gxEndTime) {
            // Stop collecting GX data
            this.gxCollecting = false;
        }

        // Detect session start transition (1800 EST / 07:00 chart time)
        if (priorTime !== null && priorTime < sessionStartTime && currentTime >= sessionStartTime) {
            // Move current IB to yesterday's IB if it exists
            if (this.ibHigh !== null && this.ibLow !== null) {
                this.yibHigh = this.ibHigh;
                this.yibLow = this.ibLow;
                this.ibHigh = null;
                this.ibLow = null;
            }
        }

        // Detect NYO transition (09:30 EST / 22:30 chart time)
        if (priorTime !== null && priorTime < nyoTime && currentTime >= nyoTime) {
            const marketActive = this.isMarketActive(currentIndex, history, timestamp);
            
            // Always capture NYO
            this.nyoPrice = d.open();
            this.nyoTimestamp = timestamp;
            this.nyoIndex = currentIndex;
            
            // Start collecting IB data
            this.ibCollecting = true;
            this.ibHigh = d.high();
            this.ibLow = d.low();
            
            // Always reset VWAP at NYO (not just when market is active)
            this.volumeSum = 0;
            this.volumePriceSum = 0;
        }

        // During IB period, continuously update high/low
        if (this.ibCollecting) {
            if (d.high() > this.ibHigh) {
                this.ibHigh = d.high();
            }
            if (d.low() < this.ibLow) {
                this.ibLow = d.low();
            }
        }

        // Detect IB end transition (10:30 EST / 23:30 chart time)
        if (priorTime !== null && priorTime < ibEndTime && currentTime >= ibEndTime) {
            // Stop collecting IB data
            this.ibCollecting = false;
            
            // Clear yesterday's IB now that we have today's
            this.yibHigh = null;
            this.yibLow = null;
        }

        // Anchored VWAP calculation - only accumulate after NYO
        let vwap = null;
        if (this.nyoIndex !== null && currentIndex >= this.nyoIndex) {
            const vol = d.volume();
            const typical = (d.high() + d.low() + d.close()) / TYPICAL_PRICE_DIVISOR;

            this.volumeSum = (this.volumeSum || 0) + vol;
            this.volumePriceSum = (this.volumePriceSum || 0) + (vol * typical);
            
            // Calculate current VWAP value
            if (this.volumeSum > 0) {
                vwap = this.volumePriceSum / this.volumeSum;
            }
        }

        // Only render labels on the last bar to avoid duplication
        if (d.isLast()) {
            // Draw New York Open label
            if (this.nyoPrice !== null) {
                items.push(this.createLabel(
                    'label-NYO',
                    currentIndex,
                    this.nyoPrice,
                    `NYO ${this.formatPrice(this.nyoPrice)}`,
                    '#FF6666'
                ));
            }
            
            // Draw Initial Balance High/Low labels (or yesterday's if today's not set yet)
            if (this.ibHigh && this.ibLow) {
                // Today's IB is set - show current day labels
                items.push(this.createLabel(
                    'label-IBH',
                    currentIndex,
                    this.ibHigh,
                    `IBH ${this.formatPrice(this.ibHigh)}`,
                    this.props.IBColor
                ));

                items.push(this.createLabel(
                    'label-IBL',
                    currentIndex,
                    this.ibLow,
                    `IBL ${this.formatPrice(this.ibLow)}`,
                    this.props.IBColor
                ));
            } else if (this.yibHigh && this.yibLow) {
                // Today's IB not set yet - show yesterday's with "y" prefix
                items.push(this.createLabel(
                    'label-yIBH',
                    currentIndex,
                    this.yibHigh,
                    `yIBH ${this.formatPrice(this.yibHigh)}`,
                    this.props.IBColor
                ));

                items.push(this.createLabel(
                    'label-yIBL',
                    currentIndex,
                    this.yibLow,
                    `yIBL ${this.formatPrice(this.yibLow)}`,
                    this.props.IBColor
                ));
            }

            // Draw Globex High/Low labels
            if (this.gxHigh && this.gxLow) {
                items.push(this.createLabel(
                    'label-GXH',
                    currentIndex,
                    this.gxHigh,
                    `GXH ${this.formatPrice(this.gxHigh)}`,
                    this.props.GXColor
                ));

                items.push(this.createLabel(
                    'label-GXL',
                    currentIndex,
                    this.gxLow,
                    `GXL ${this.formatPrice(this.gxLow)}`,
                    this.props.GXColor
                ));
            }

            // Draw Anchored VWAP label
            if (vwap !== null) {
                items.push(this.createLabel(
                    'label-NYVWAP',
                    currentIndex,
                    vwap,
                    `NY ${this.formatVWAP(vwap)}`,
                    '#6699FF'
                ));
            }

            // Draw all static price level labels
            for (const level of this.levels) {
                items.push(this.createLabel(
                    `label-${level.label}-${level.price}`,
                    currentIndex,
                    level.price,
                    `${level.label} ${this.formatPrice(level.price)}`,
                    '#FFD700',
                    this.props.LabelOffset
                ));
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
        NYOHour: predef.paramSpecs.number(22, 1, 0),
        NYOMinute: predef.paramSpecs.number(30, 1, 0),
        LabelOffset: predef.paramSpecs.number(50, 1, 0),
        HideDecimals: predef.paramSpecs.bool(true),
        IBColor: predef.paramSpecs.color('#00FFAA'),
        GXColor: predef.paramSpecs.color('#AAAAAA')
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
