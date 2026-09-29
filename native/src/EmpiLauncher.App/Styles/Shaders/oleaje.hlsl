// OLEAJE: the bottom of a pool seen from above, at night. Light caustics drift over deep blue water, brightest around the light (to the
// right of the modpack's text) and tinted with the accent, with a warm and a cold fringe where the light splits. A click drops a ripple
// that bends the caustics as it spreads. Arriving, the tide comes in: a water line rises from the bottom edge, rocking as it climbs, with
// foam on its crest. What the field draws itself (the ghost name, the tide of a download) comes in as the input and stays on top.
// Compiled by native/tools/compile-shaders.ps1 (ps_3_0); coordinates are y-down, 0..1 across the field.

sampler2D Input : register(s0);
float4 Res : register(c0);      // xy: the field's size
float4 Clock : register(c1);    // x: the water's time, y: the clock, z: intensity, w: motion (1, or 0 when it must hold still)
float4 Acc : register(c2);      // the accent
float4 Aura : register(c3);     // xy: where the light is
float4 Reveal : register(c4);   // x: how far the arrival has got, y: 1 while arriving
float4 Waves[12] : register(c8); // x, y, age in s, strength

#define TAU 6.28318530718

float2 mod2(float2 x, float y) { return x - y * floor(x / y); }

float caustic(float2 uv, float t)
{
    float2 p = mod2(uv * TAU, TAU) - 250.0;
    float2 i = p;
    float c = 1.0;
    const float inten = 0.005;
    [loop] for (int n = 0; n < 5; n++)
    {
        float tt = t * (1.0 - (3.5 / (n + 1.0)));
        i = p + float2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
        c += 1.0 / length(float2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
    }
    c /= 5.0;
    c = 1.17 - pow(abs(c), 1.4);   // c is at least 1 here
    return pow(abs(c), 8.0);
}

float4 main(float2 uv : TEXCOORD) : COLOR
{
    float4 over = tex2D(Input, uv);
    float2 asp = float2(Res.x / Res.y, 1.0);
    float2 pos = uv * asp;

    // the tide: what shows, and the crest with its foam
    float2 rv = float2(1.0, 0.0);
    if (Reveal.y > 0.5)
    {
        float edge = lerp(1.14, -0.16, Reveal.x) + 0.045 * sin(uv.x * 3.1 + Clock.y * 1.4) + 0.022 * sin(uv.x * 9.0 - Clock.y * 3.3) + 0.009 * sin(uv.x * 27.0 + Clock.y * 5.1);
        float e = uv.y - edge;
        float crest = exp(-e * e / 0.00045);
        float foam = e > 0.0 ? exp(-e * 22.0) * 0.5 : 0.0;
        rv = float2(max(smoothstep(-0.004, 0.004, e), crest * 0.9), crest + foam);
    }

    float2 disp = float2(0.0, 0.02 * rv.y * sin(uv.x * 40.0 + Clock.y * 7.0) * Clock.w);
    float ring = rv.y * 1.1;
    float3 spec = rv.y * 0.4 * (0.5 + 0.5 * cos(TAU * (float3(0.0, 0.33, 0.67) + uv.x * 3.0)));
    [loop] for (int k = 0; k < 12; k++)
    {
        float4 w = Waves[k];
        if (w.w > 0.0)
        {
            float2 d = pos - w.xy * asp;
            float dist = length(d);
            float R = w.z * 0.45;
            float fade = w.w * max(0.0, 1.0 - R / 1.9);
            float x = dist - R;
            float front = exp(-x * x / 0.0022) * fade;
            ring += front + (x < 0.0 ? exp(x * 7.0) * 0.3 * fade : 0.0);
            disp += (d / max(dist, 1e-4)) * sin(x * 55.0) * exp(-x * x / 0.012) * 0.018 * fade * Clock.w;
            spec += front * (0.5 + 0.5 * cos(TAU * (float3(0.0, 0.33, 0.67) + x * 9.0)));
        }
    }

    float t = Clock.x * 0.42;
    float2 q = pos + disp;
    float2 r2 = float2(0.866 * q.x - 0.5 * q.y, 0.5 * q.x + 0.866 * q.y);
    float2 cuv = float2(r2.x * 1.15, r2.y * 2.6);
    cuv += 0.10 * float2(sin(q.y * 2.3 + t * 0.8), cos(q.x * 1.9 - t * 0.6));
    float split = 0.013 + 0.035 * ring;
    float cr = caustic(cuv + float2(split, split * 0.4), t);
    float cg = caustic(cuv, t);
    float cb = caustic(cuv - float2(split, split * 0.4), t);

    float2 a = Aura.xy * asp;
    float da = length((pos - a) * float2(0.75, 1.0));
    float aura = exp(-da * da * 2.4);
    float field = lerp(0.12, 1.0, aura) * (0.35 + 0.65 * smoothstep(0.1, 0.45, uv.x));
    float amt = Clock.z * field + ring * 0.9;
    float3 base = lerp(float3(0.008, 0.016, 0.038), float3(0.03, 0.07, 0.16), aura);
    base += Acc.rgb * aura * 0.12 * (0.4 + Clock.z);
    float3 light = lerp(Acc.rgb, float3(1.0, 0.98, 0.94), smoothstep(0.25, 1.0, cg));
    float3 col = base + light * cg * amt * 1.25;
    col += float3(1.0, 0.38, 0.14) * max(0.0, cr - cb) * amt * 2.2;
    col += float3(0.35, 0.55, 1.0) * max(0.0, cb - cr) * amt * 0.7;
    col += spec * 0.35;
    col += Acc.rgb * aura * aura * 0.2 * Clock.z;
    float v = smoothstep(1.3, 0.3, length((uv - float2(0.62, 0.58)) * float2(1.0, 1.2)));
    col *= lerp(0.4, 1.0, v);
    col = pow(max(col, 0.0), 1.14);

    float4 water = float4(col * rv.x, rv.x);
    return over + water * (1.0 - over.a);   // premultiplied: the field's own drawings over the water
}
