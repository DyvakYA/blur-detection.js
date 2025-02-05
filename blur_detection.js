function detectEdges(imageData) {
    var greyscaled, sobelKernel;

    if (imageData.width >= 360) {
        greyscaled = luminance(gaussianBlur(imageData, 5.0));
    } else {
        greyscaled = luminance(imageData);
    }
    sobelKernel = getFloat32Array(
        [1, 0, -1,
            2, 0, -2,
            1, 0, -1]);
    return convolve(greyscaled, sobelKernel, true);
}

// Reduce imageData from RGBA to only one channel (Y/luminance after conversion to greyscale)
// since RGB all have the same values and Alpha was ignored.
function reducedPixels(imageData) {
    var i, x, y, row,
        pixels = imageData.data,
        rowLen = imageData.width * 4,
        rows = [];

    for (y = 0; y < pixels.length; y += rowLen) {
        row = new Uint8ClampedArray(imageData.width);
        x = 0;
        for (i = y; i < y + rowLen; i += 4) {
            row[x] = pixels[i];
            x += 1;
        }
        rows.push(row);
    }
    return rows;
}

// pixels = Array of Uint8ClampedArrays (row in original image)
function detectBlur(pixels) {
    var x, y, value, oldValue, edgeStart, edgeWidth, bm, percWidth,
        width = pixels[0].length,
        height = pixels.length,
        numEdges = 0,
        sumEdgeWidths = 0,
        edgeIntensThresh = 20;

    for (y = 0; y < height; y += 1) {
        // Reset edge marker, none found yet
        edgeStart = -1;
        for (x = 0; x < width; x += 1) {
            value = pixels[y][x];
            // Edge is still open
            if (edgeStart >= 0 && x > edgeStart) {
                oldValue = pixels[y][x - 1];
                // Value stopped increasing => edge ended
                if (value < oldValue) {
                    // Only count edges that reach a certain intensity
                    if (oldValue >= edgeIntensThresh) {
                        edgeWidth = x - edgeStart - 1;
                        numEdges += 1;
                        sumEdgeWidths += edgeWidth;
                    }
                    edgeStart = -1; // Reset edge marker
                }
            }
            // Edge starts
            if (value == 0) {
                edgeStart = x;
            }
        }
    }

    if (numEdges === 0) {
        bm = 0;
        percWidth = 0;
    } else {
        bm = sumEdgeWidths / numEdges;
        percWidth = bm / width * 100;
    }

    return {
        width: width,
        height: height,
        num_edges: numEdges,
        avg_edge_width: bm,
        avg_edge_width_perc: percWidth
    };
}

function measureBlur(imageData) {
    let score = detectBlur(reducedPixels(detectEdges(imageData)));
    return widthCorrection(score, imageData);
}

function widthCorrection(score, image){

    // correction by width
    if(image.width > 500 && image.width <= 1000){
        score.avg_edge_width_perc = score.avg_edge_width_perc * 1.93;
    }else if(image.width > 1000 && image.width <= 1500){
        score.avg_edge_width_perc = score.avg_edge_width_perc * 2.81;
    } else if(image.width > 1500 && image.width <= 2000){
        score.avg_edge_width_perc = score.avg_edge_width_perc * 3.65;
    } else if(image.width > 2000 && image.width <= 2500){
        score.avg_edge_width_perc = score.avg_edge_width_perc * 4.76;
    } else if(image.width > 2500 && image.width <= 3000){
        score.avg_edge_width_perc = score.avg_edge_width_perc * 5.63;
    } else if(image.width > 3000){
        score.avg_edge_width_perc = score.avg_edge_width_perc * 6.70;
    }

    // correction by edges num
    if(score.num_edges < 3000){
        score.avg_edge_width_perc = score.avg_edge_width_perc - 1;
    }

    // correction for web camera
    if(image.width === 318 && image.height === 239){
        if(score.avg_edge_width_perc < 0){
            score.avg_edge_width_perc = score.avg_edge_width_perc * 6.3 + 2.016;
        }
    }

    // corrections for photo with low amount of edges
    if(score.num_edges < 1000){
        score.avg_edge_width_perc = 100;
    }

    return score;
}

measureBlur.setup = function (configExt) {
    Object.assign(config, configExt);
};


if (typeof Float32Array == 'undefined') {
    getFloat32Array =
        getUint8Array = function (len) {
            if (len.length) {
                return len.slice(0);
            }
            return new Array(len);
        };
} else {
    getFloat32Array = function (len) {
        return new Float32Array(len);
    };
    getUint8Array = function (len) {
        return new Uint8Array(len);
    };
}

if (typeof document != 'undefined') {
    tmpCanvas = document.createElement('canvas');
    tmpCtx = tmpCanvas.getContext('2d');

    getPixels = function (img) {
        var c, ctx;
        if (img.getContext) {
            c = img;
            try {
                ctx = c.getContext('2d');
            } catch (e) {
            }
        }
        if (!ctx) {
            c = this.getCanvas(img.width, img.height);
            ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);
        }
        return ctx.getImageData(0, 0, c.width, c.height);
    };

    createImageData = function (w, h) {
        return this.tmpCtx.createImageData(w, h);
    };

    getCanvas = function (w, h) {
        var c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
    };

    filterImage = function (filter, image, var_args) {
        var args = [this.getPixels(image)];
        for (var i = 2; i < arguments.length; i++) {
            args.push(arguments[i]);
        }
        return filter.apply(this, args);
    };

    toCanvas = function (pixels) {
        var canvas = this.getCanvas(pixels.width, pixels.height);
        canvas.getContext('2d').putImageData(pixels, 0, 0);
        return canvas;
    };

    toImageData = function (pixels) {
        return this.identity(pixels);
    };

} else {

    onmessage = function (e) {
        var ds = e.data;
        if (!ds.length) {
            ds = [ds];
        }
        postMessage(runPipeline(ds));
    };

    createImageData = function (w, h) {
        return {width: w, height: h, data: this.getFloat32Array(w * h * 4)};
    };

}

runPipeline = function (ds) {
    var res = null;
    res = this[ds[0].name].apply(this, ds[0].args);
    for (var i = 1; i < ds.length; i++) {
        var d = ds[i];
        var args = d.args.slice(0);
        args.unshift(res);
        res = this[d.name].apply(this, args);
    }
    return res;
};

createImageDataFloat32 = function (w, h) {
    return {width: w, height: h, data: this.getFloat32Array(w * h * 4)};
};

identity = function (pixels, args) {
    var output = createImageData(pixels.width, pixels.height);
    var dst = output.data;
    var d = pixels.data;
    for (var i = 0; i < d.length; i++) {
        dst[i] = d[i];
    }
    return output;
};

horizontalFlip = function (pixels) {
    var output = createImageData(pixels.width, pixels.height);
    var w = pixels.width;
    var h = pixels.height;
    var dst = output.data;
    var d = pixels.data;
    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var off = (y * w + x) * 4;
            var dstOff = (y * w + (w - x - 1)) * 4;
            dst[dstOff] = d[off];
            dst[dstOff + 1] = d[off + 1];
            dst[dstOff + 2] = d[off + 2];
            dst[dstOff + 3] = d[off + 3];
        }
    }
    return output;
};

verticalFlip = function (pixels) {
    var output = createImageData(pixels.width, pixels.height);
    var w = pixels.width;
    var h = pixels.height;
    var dst = output.data;
    var d = pixels.data;
    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var off = (y * w + x) * 4;
            var dstOff = ((h - y - 1) * w + x) * 4;
            dst[dstOff] = d[off];
            dst[dstOff + 1] = d[off + 1];
            dst[dstOff + 2] = d[off + 2];
            dst[dstOff + 3] = d[off + 3];
        }
    }
    return output;
};

luminance = function (pixels, args) {
    var output = createImageData(pixels.width, pixels.height);
    var dst = output.data;
    var d = pixels.data;
    for (var i = 0; i < d.length; i += 4) {
        var r = d[i];
        var g = d[i + 1];
        var b = d[i + 2];
        // CIE luminance for the RGB
        var v = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        dst[i] = dst[i + 1] = dst[i + 2] = v;
        dst[i + 3] = d[i + 3];
    }
    return output;
};

grayscale = function (pixels, args) {
    var output = createImageData(pixels.width, pixels.height);
    var dst = output.data;
    var d = pixels.data;
    for (var i = 0; i < d.length; i += 4) {
        var r = d[i];
        var g = d[i + 1];
        var b = d[i + 2];
        var v = 0.3 * r + 0.59 * g + 0.11 * b;
        dst[i] = dst[i + 1] = dst[i + 2] = v;
        dst[i + 3] = d[i + 3];
    }
    return output;
};

grayscaleAvg = function (pixels, args) {
    var output = createImageData(pixels.width, pixels.height);
    var dst = output.data;
    var d = pixels.data;
    var f = 1 / 3;
    for (var i = 0; i < d.length; i += 4) {
        var r = d[i];
        var g = d[i + 1];
        var b = d[i + 2];
        var v = (r + g + b) * f;
        dst[i] = dst[i + 1] = dst[i + 2] = v;
        dst[i + 3] = d[i + 3];
    }
    return output;
};

threshold = function (pixels, threshold, high, low) {
    var output = createImageData(pixels.width, pixels.height);
    if (high == null) high = 255;
    if (low == null) low = 0;
    var d = pixels.data;
    var dst = output.data;
    for (var i = 0; i < d.length; i += 4) {
        var r = d[i];
        var g = d[i + 1];
        var b = d[i + 2];
        var v = (0.3 * r + 0.59 * g + 0.11 * b >= threshold) ? high : low;
        dst[i] = dst[i + 1] = dst[i + 2] = v;
        dst[i + 3] = d[i + 3];
    }
    return output;
};

invert = function (pixels) {
    var output = FcreateImageData(pixels.width, pixels.height);
    var d = pixels.data;
    var dst = output.data;
    for (var i = 0; i < d.length; i += 4) {
        dst[i] = 255 - d[i];
        dst[i + 1] = 255 - d[i + 1];
        dst[i + 2] = 255 - d[i + 2];
        dst[i + 3] = d[i + 3];
    }
    return output;
};

brightnessContrast = function (pixels, brightness, contrast) {
    var lut = this.brightnessContrastLUT(brightness, contrast);
    return this.applyLUT(pixels, {r: lut, g: lut, b: lut, a: this.identityLUT()});
};

applyLUT = function (pixels, lut) {
    var output = createImageData(pixels.width, pixels.height);
    var d = pixels.data;
    var dst = output.data;
    var r = lut.r;
    var g = lut.g;
    var b = lut.b;
    var a = lut.a;
    for (var i = 0; i < d.length; i += 4) {
        dst[i] = r[d[i]];
        dst[i + 1] = g[d[i + 1]];
        dst[i + 2] = b[d[i + 2]];
        dst[i + 3] = a[d[i + 3]];
    }
    return output;
};

createLUTFromCurve = function (points) {
    var lut = this.getUint8Array(256);
    var p = [0, 0];
    for (var i = 0, j = 0; i < lut.length; i++) {
        while (j < points.length && points[j][0] < i) {
            p = points[j];
            j++;
        }
        lut[i] = p[1];
    }
    return lut;
};

identityLUT = function () {
    var lut = this.getUint8Array(256);
    for (var i = 0; i < lut.length; i++) {
        lut[i] = i;
    }
    return lut;
};

invertLUT = function () {
    var lut = this.getUint8Array(256);
    for (var i = 0; i < lut.length; i++) {
        lut[i] = 255 - i;
    }
    return lut;
};

brightnessContrastLUT = function (brightness, contrast) {
    var lut = this.getUint8Array(256);
    var contrastAdjust = -128 * contrast + 128;
    var brightnessAdjust = 255 * brightness;
    var adjust = contrastAdjust + brightnessAdjust;
    for (var i = 0; i < lut.length; i++) {
        var c = i * contrast + adjust;
        lut[i] = c < 0 ? 0 : (c > 255 ? 255 : c);
    }
    return lut;
};

convolve = function (pixels, weights, opaque) {
    var side = Math.round(Math.sqrt(weights.length));
    var halfSide = Math.floor(side / 2);

    var src = pixels.data;
    var sw = pixels.width;
    var sh = pixels.height;

    var w = sw;
    var h = sh;
    var output = createImageData(w, h);
    var dst = output.data;

    var alphaFac = opaque ? 1 : 0;

    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var sy = y;
            var sx = x;
            var dstOff = (y * w + x) * 4;
            var r = 0, g = 0, b = 0, a = 0;
            for (var cy = 0; cy < side; cy++) {
                for (var cx = 0; cx < side; cx++) {
                    var scy = Math.min(sh - 1, Math.max(0, sy + cy - halfSide));
                    var scx = Math.min(sw - 1, Math.max(0, sx + cx - halfSide));
                    var srcOff = (scy * sw + scx) * 4;
                    var wt = weights[cy * side + cx];
                    r += src[srcOff] * wt;
                    g += src[srcOff + 1] * wt;
                    b += src[srcOff + 2] * wt;
                    a += src[srcOff + 3] * wt;
                }
            }
            dst[dstOff] = r;
            dst[dstOff + 1] = g;
            dst[dstOff + 2] = b;
            dst[dstOff + 3] = a + alphaFac * (255 - a);
        }
    }
    return output;
};

verticalConvolve = function (pixels, weightsVector, opaque) {
    var side = weightsVector.length;
    var halfSide = Math.floor(side / 2);

    var src = pixels.data;
    var sw = pixels.width;
    var sh = pixels.height;

    var w = sw;
    var h = sh;
    var output = createImageData(w, h);
    var dst = output.data;

    var alphaFac = opaque ? 1 : 0;

    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var sy = y;
            var sx = x;
            var dstOff = (y * w + x) * 4;
            var r = 0, g = 0, b = 0, a = 0;
            for (var cy = 0; cy < side; cy++) {
                var scy = Math.min(sh - 1, Math.max(0, sy + cy - halfSide));
                var scx = sx;
                var srcOff = (scy * sw + scx) * 4;
                var wt = weightsVector[cy];
                r += src[srcOff] * wt;
                g += src[srcOff + 1] * wt;
                b += src[srcOff + 2] * wt;
                a += src[srcOff + 3] * wt;
            }
            dst[dstOff] = r;
            dst[dstOff + 1] = g;
            dst[dstOff + 2] = b;
            dst[dstOff + 3] = a + alphaFac * (255 - a);
        }
    }
    return output;
};

horizontalConvolve = function (pixels, weightsVector, opaque) {
    var side = weightsVector.length;
    var halfSide = Math.floor(side / 2);

    var src = pixels.data;
    var sw = pixels.width;
    var sh = pixels.height;

    var w = sw;
    var h = sh;
    var output = createImageData(w, h);
    var dst = output.data;

    var alphaFac = opaque ? 1 : 0;

    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var sy = y;
            var sx = x;
            var dstOff = (y * w + x) * 4;
            var r = 0, g = 0, b = 0, a = 0;
            for (var cx = 0; cx < side; cx++) {
                var scy = sy;
                var scx = Math.min(sw - 1, Math.max(0, sx + cx - halfSide));
                var srcOff = (scy * sw + scx) * 4;
                var wt = weightsVector[cx];
                r += src[srcOff] * wt;
                g += src[srcOff + 1] * wt;
                b += src[srcOff + 2] * wt;
                a += src[srcOff + 3] * wt;
            }
            dst[dstOff] = r;
            dst[dstOff + 1] = g;
            dst[dstOff + 2] = b;
            dst[dstOff + 3] = a + alphaFac * (255 - a);
        }
    }
    return output;
};

separableConvolve = function (pixels, horizWeights, vertWeights, opaque) {
    return this.horizontalConvolve(
        this.verticalConvolveFloat32(pixels, vertWeights, opaque),
        horizWeights, opaque
    );
};

convolveFloat32 = function (pixels, weights, opaque) {
    var side = Math.round(Math.sqrt(weights.length));
    var halfSide = Math.floor(side / 2);

    var src = pixels.data;
    var sw = pixels.width;
    var sh = pixels.height;

    var w = sw;
    var h = sh;
    var output = createImageDataFloat32(w, h);
    var dst = output.data;

    var alphaFac = opaque ? 1 : 0;

    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var sy = y;
            var sx = x;
            var dstOff = (y * w + x) * 4;
            var r = 0, g = 0, b = 0, a = 0;
            for (var cy = 0; cy < side; cy++) {
                for (var cx = 0; cx < side; cx++) {
                    var scy = Math.min(sh - 1, Math.max(0, sy + cy - halfSide));
                    var scx = Math.min(sw - 1, Math.max(0, sx + cx - halfSide));
                    var srcOff = (scy * sw + scx) * 4;
                    var wt = weights[cy * side + cx];
                    r += src[srcOff] * wt;
                    g += src[srcOff + 1] * wt;
                    b += src[srcOff + 2] * wt;
                    a += src[srcOff + 3] * wt;
                }
            }
            dst[dstOff] = r;
            dst[dstOff + 1] = g;
            dst[dstOff + 2] = b;
            dst[dstOff + 3] = a + alphaFac * (255 - a);
        }
    }
    return output;
};


verticalConvolveFloat32 = function (pixels, weightsVector, opaque) {
    var side = weightsVector.length;
    var halfSide = Math.floor(side / 2);

    var src = pixels.data;
    var sw = pixels.width;
    var sh = pixels.height;

    var w = sw;
    var h = sh;
    var output = createImageDataFloat32(w, h);
    var dst = output.data;

    var alphaFac = opaque ? 1 : 0;

    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var sy = y;
            var sx = x;
            var dstOff = (y * w + x) * 4;
            var r = 0, g = 0, b = 0, a = 0;
            for (var cy = 0; cy < side; cy++) {
                var scy = Math.min(sh - 1, Math.max(0, sy + cy - halfSide));
                var scx = sx;
                var srcOff = (scy * sw + scx) * 4;
                var wt = weightsVector[cy];
                r += src[srcOff] * wt;
                g += src[srcOff + 1] * wt;
                b += src[srcOff + 2] * wt;
                a += src[srcOff + 3] * wt;
            }
            dst[dstOff] = r;
            dst[dstOff + 1] = g;
            dst[dstOff + 2] = b;
            dst[dstOff + 3] = a + alphaFac * (255 - a);
        }
    }
    return output;
};

horizontalConvolveFloat32 = function (pixels, weightsVector, opaque) {
    var side = weightsVector.length;
    var halfSide = Math.floor(side / 2);

    var src = pixels.data;
    var sw = pixels.width;
    var sh = pixels.height;

    var w = sw;
    var h = sh;
    var output = createImageDataFloat32(w, h);
    var dst = output.data;

    var alphaFac = opaque ? 1 : 0;

    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var sy = y;
            var sx = x;
            var dstOff = (y * w + x) * 4;
            var r = 0, g = 0, b = 0, a = 0;
            for (var cx = 0; cx < side; cx++) {
                var scy = sy;
                var scx = Math.min(sw - 1, Math.max(0, sx + cx - halfSide));
                var srcOff = (scy * sw + scx) * 4;
                var wt = weightsVector[cx];
                r += src[srcOff] * wt;
                g += src[srcOff + 1] * wt;
                b += src[srcOff + 2] * wt;
                a += src[srcOff + 3] * wt;
            }
            dst[dstOff] = r;
            dst[dstOff + 1] = g;
            dst[dstOff + 2] = b;
            dst[dstOff + 3] = a + alphaFac * (255 - a);
        }
    }
    return output;
};

separableConvolveFloat32 = function (pixels, horizWeights, vertWeights, opaque) {
    return this.horizontalConvolveFloat32(
        this.verticalConvolveFloat32(pixels, vertWeights, opaque),
        horizWeights, opaque
    );
};

gaussianBlur = function (pixels, diameter) {
    diameter = Math.abs(diameter);
    if (diameter <= 1) return identity(pixels);
    var radius = diameter / 2;
    var len = Math.ceil(diameter) + (1 - (Math.ceil(diameter) % 2))
    var weights = this.getFloat32Array(len);
    var rho = (radius + 0.5) / 3;
    var rhoSq = rho * rho;
    var gaussianFactor = 1 / Math.sqrt(2 * Math.PI * rhoSq);
    var rhoFactor = -1 / (2 * rho * rho)
    var wsum = 0;
    var middle = Math.floor(len / 2);
    for (var i = 0; i < len; i++) {
        var x = i - middle;
        var gx = gaussianFactor * Math.exp(x * x * rhoFactor);
        weights[i] = gx;
        wsum += gx;
    }
    for (var i = 0; i < weights.length; i++) {
        weights[i] /= wsum;
    }
    return separableConvolve(pixels, weights, weights, false);
};

laplaceKernel = getFloat32Array(
    [-1, -1, -1,
        -1, 8, -1,
        -1, -1, -1]);
laplace = function (pixels) {
    return convolve(pixels, this.laplaceKernel, true);
};

sobelSignVector = getFloat32Array([-1, 0, 1]);
sobelScaleVector = getFloat32Array([1, 2, 1]);

sobelVerticalGradient = function (px) {
    return this.separableConvolveFloat32(px, this.sobelSignVector, this.sobelScaleVector);
};

sobelHorizontalGradient = function (px) {
    return this.separableConvolveFloat32(px, this.sobelScaleVector, this.sobelSignVector);
};

function sobelVectors(px) {
    var vertical = this.sobelVerticalGradient(px);
    var horizontal = this.sobelHorizontalGradient(px);
    var id = {
        width: vertical.width, height: vertical.height,
        data: this.getFloat32Array(vertical.width * vertical.height * 8)
    };
    var vd = vertical.data;
    var hd = horizontal.data;
    var idd = id.data;
    for (var i = 0, j = 0; i < idd.length; i += 2, j++) {
        idd[i] = hd[j];
        idd[i + 1] = vd[j];
    }
    return id;
};

function sobel(px) {
    px = this.grayscale(px);
    var vertical = this.sobelVerticalGradient(px);
    var horizontal = this.sobelHorizontalGradient(px);
    var id = this.createImageData(vertical.width, vertical.height);
    for (var i = 0; i < id.data.length; i += 4) {
        var v = Math.abs(vertical.data[i]);
        id.data[i] = v;
        var h = Math.abs(horizontal.data[i]);
        id.data[i + 1] = h;
        id.data[i + 2] = (v + h) / 4;
        id.data[i + 3] = 255;
    }
    return id;
};

function bilinearSample(pixels, x, y, rgba) {
    var x1 = Math.floor(x);
    var x2 = Math.ceil(x);
    var y1 = Math.floor(y);
    var y2 = Math.ceil(y);
    var a = (x1 + pixels.width * y1) * 4;
    var b = (x2 + pixels.width * y1) * 4;
    var c = (x1 + pixels.width * y2) * 4;
    var d = (x2 + pixels.width * y2) * 4;
    var df = ((x - x1) + (y - y1));
    var cf = ((x2 - x) + (y - y1));
    var bf = ((x - x1) + (y2 - y));
    var af = ((x2 - x) + (y2 - y));
    var rsum = 1 / (af + bf + cf + df);
    af *= rsum;
    bf *= rsum;
    cf *= rsum;
    df *= rsum;
    var data = pixels.data;
    rgba[0] = data[a] * af + data[b] * bf + data[c] * cf + data[d] * df;
    rgba[1] = data[a + 1] * af + data[b + 1] * bf + data[c + 1] * cf + data[d + 1] * df;
    rgba[2] = data[a + 2] * af + data[b + 2] * bf + data[c + 2] * cf + data[d + 2] * df;
    rgba[3] = data[a + 3] * af + data[b + 3] * bf + data[c + 3] * cf + data[d + 3] * df;
    return rgba;
};

function distortSine(pixels, amount, yamount) {
    if (amount == null) amount = 0.5;
    if (yamount == null) yamount = amount;
    var output = this.createImageData(pixels.width, pixels.height);
    var dst = output.data;
    var d = pixels.data;
    var px = this.createImageData(1, 1).data;
    for (var y = 0; y < output.height; y++) {
        var sy = -Math.sin(y / (output.height - 1) * Math.PI * 2);
        var srcY = y + sy * yamount * output.height / 4;
        srcY = Math.max(Math.min(srcY, output.height - 1), 0);

        for (var x = 0; x < output.width; x++) {
            var sx = -Math.sin(x / (output.width - 1) * Math.PI * 2);
            var srcX = x + sx * amount * output.width / 4;
            srcX = Math.max(Math.min(srcX, output.width - 1), 0);

            var rgba = this.bilinearSample(pixels, srcX, srcY, px);

            var off = (y * output.width + x) * 4;
            dst[off] = rgba[0];
            dst[off + 1] = rgba[1];
            dst[off + 2] = rgba[2];
            dst[off + 3] = rgba[3];
        }
    }
    return output;
};

function darkenBlend(below, above) {
    var output = createImageData(below.width, below.height);
    var a = below.data;
    var b = above.data;
    var dst = output.data;
    var f = 1 / 255;
    for (var i = 0; i < a.length; i += 4) {
        dst[i] = a[i] < b[i] ? a[i] : b[i];
        dst[i + 1] = a[i + 1] < b[i + 1] ? a[i + 1] : b[i + 1];
        dst[i + 2] = a[i + 2] < b[i + 2] ? a[i + 2] : b[i + 2];
        dst[i + 3] = a[i + 3] + ((255 - a[i + 3]) * b[i + 3]) * f;
    }
    return output;
};

function lightenBlend(below, above) {
    var output = createImageData(below.width, below.height);
    var a = below.data;
    var b = above.data;
    var dst = output.data;
    var f = 1 / 255;
    for (var i = 0; i < a.length; i += 4) {
        dst[i] = a[i] > b[i] ? a[i] : b[i];
        dst[i + 1] = a[i + 1] > b[i + 1] ? a[i + 1] : b[i + 1];
        dst[i + 2] = a[i + 2] > b[i + 2] ? a[i + 2] : b[i + 2];
        dst[i + 3] = a[i + 3] + ((255 - a[i + 3]) * b[i + 3]) * f;
    }
    return output;
};

function multiplyBlend(below, above) {
    var output = createImageData(below.width, below.height);
    var a = below.data;
    var b = above.data;
    var dst = output.data;
    var f = 1 / 255;
    for (var i = 0; i < a.length; i += 4) {
        dst[i] = (a[i] * b[i]) * f;
        dst[i + 1] = (a[i + 1] * b[i + 1]) * f;
        dst[i + 2] = (a[i + 2] * b[i + 2]) * f;
        dst[i + 3] = a[i + 3] + ((255 - a[i + 3]) * b[i + 3]) * f;
    }
    return output;
};

function screenBlend(below, above) {
    var output = createImageData(below.width, below.height);
    var a = below.data;
    var b = above.data;
    var dst = output.data;
    var f = 1 / 255;
    for (var i = 0; i < a.length; i += 4) {
        dst[i] = a[i] + b[i] - a[i] * b[i] * f;
        dst[i + 1] = a[i + 1] + b[i + 1] - a[i + 1] * b[i + 1] * f;
        dst[i + 2] = a[i + 2] + b[i + 2] - a[i + 2] * b[i + 2] * f;
        dst[i + 3] = a[i + 3] + ((255 - a[i + 3]) * b[i + 3]) * f;
    }
    return output;
};

function addBlend(below, above) {
    var output = createImageData(below.width, below.height);
    var a = below.data;
    var b = above.data;
    var dst = output.data;
    var f = 1 / 255;
    for (var i = 0; i < a.length; i += 4) {
        dst[i] = (a[i] + b[i]);
        dst[i + 1] = (a[i + 1] + b[i + 1]);
        dst[i + 2] = (a[i + 2] + b[i + 2]);
        dst[i + 3] = a[i + 3] + ((255 - a[i + 3]) * b[i + 3]) * f;
    }
    return output;
};

function subBlend(below, above) {
    var output = createImageData(below.width, below.height);
    var a = below.data;
    var b = above.data;
    var dst = output.data;
    var f = 1 / 255;
    for (var i = 0; i < a.length; i += 4) {
        dst[i] = (a[i] + b[i] - 255);
        dst[i + 1] = (a[i + 1] + b[i + 1] - 255);
        dst[i + 2] = (a[i + 2] + b[i + 2] - 255);
        dst[i + 3] = a[i + 3] + ((255 - a[i + 3]) * b[i + 3]) * f;
    }
    return output;
};

function differenceBlend(below, above) {
    var output = createImageData(below.width, below.height);
    var a = below.data;
    var b = above.data;
    var dst = output.data;
    var f = 1 / 255;
    for (var i = 0; i < a.length; i += 4) {
        dst[i] = Math.abs(a[i] - b[i]);
        dst[i + 1] = Math.abs(a[i + 1] - b[i + 1]);
        dst[i + 2] = Math.abs(a[i + 2] - b[i + 2]);
        dst[i + 3] = a[i + 3] + ((255 - a[i + 3]) * b[i + 3]) * f;
    }
    return output;
};

function erode(pixels) {
    var src = pixels.data;
    var sw = pixels.width;
    var sh = pixels.height;

    var w = sw;
    var h = sh;
    var output = createImageData(w, h);
    var dst = output.data;

    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var sy = y;
            var sx = x;
            var dstOff = (y * w + x) * 4;
            var srcOff = (sy * sw + sx) * 4;
            var v = 0;
            if (src[srcOff] == 0) {
                if (src[(sy * sw + Math.max(0, sx - 1)) * 4] == 0 &&
                    src[(Math.max(0, sy - 1) * sw + sx) * 4] == 0) {
                    v = 255;
                }
            } else {
                v = 255;
            }
            dst[dstOff] = v;
            dst[dstOff + 1] = v;
            dst[dstOff + 2] = v;
            dst[dstOff + 3] = 255;
        }
    }
    return output;
};

function checkBlur(e) {
    let done = function (img) {
        let canvas = document.createElement('canvas');
        let context = canvas.getContext("2d");
        canvas.width = img.width;
        canvas.height = img.height;
        let data = (img instanceof HTMLImageElement) ? img : img.data;
        context.drawImage(data, 0, 0);

        let canvasData = context.getImageData(0, 0, canvas.width, canvas.height);
        let score = measureBlur(canvasData);
        // console.log('Score -> ' + JSON.stringify(score));
        return score.avg_edge_width_perc.toFixed(2) > 1.00;
    };

    if (e instanceof File && (e.type === "image/jpeg"
        || e.type === "image/bmp"
        || e.type === "image/png")) {
        return readImageFile(e)
            .then(done, console.error);
    } else if (e instanceof HTMLImageElement) {
        return done(e);
    } else {
        return new Promise(function (resolve) {
            resolve(false);
        });
    }
}

function readImageFile(rawFile) {
    return new Promise(function (resolve, reject) {
        if (!rawFile) return reject();

        var reader = new FileReader();
        reader.onload = function (readerEvent) {
            var img = new Image();
            img.onload = function () {
                resolve({ // NOTE: This is not ImageData object!
                    rawFile: rawFile,
                    data: img,
                    width: img.width,
                    height: img.height
                });
            };
            img.onerror = reject;
            img.src = readerEvent.target.result;
        };
        reader.readAsDataURL(rawFile);
    });
}