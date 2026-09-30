// TÉRMICO: a thermal camera. A heat map of slowly folding noise, from cold black through teal and violet (the accent's) to pink, orange
// and white-hot, strongest around the light to the right of the modpack's text, with the camera's red and blue channels slightly out of
// register. A click is a hot spot that spreads as a ring. Arriving, it heats up: the new picture starts at the light and melts outward
// along the noise, with a burning edge. The field's own drawings (the camera's box, its readout and scale) come in as the input and stay
// on top. Noise comes from a small tileable texture (Noise) instead of being computed, so the shader fits ps_3_0.
// Compiled by native/tools/compile-shaders.ps1; coordinates are y-down, 0..1 across the field.

sampler2D Input : register(s0);
sampler2D Noise : register(s1);
float4 Res : register(c0);      // xy: the field's size, z: the player's intensity (Ajustes > Fondo), 0..1
float4 Clock : register(c1);    // x: the picture's time, y: the clock, z: intensity, w: motion
float4 Acc : register(c2);      // the accent
float4 Aura : register(c3);     // xy: where the light is
float4 Reveal : register(c4);   // x: how far the arrival has got, y: 1 while arriving
float4 Waves[12] : register(c8); // x, y, age in s, strength

// value noise from the texture: 64 cells across it, -1..1
// value noise from the texture: 64 cells across it, -1..1. The lookup stays between the first and the last texel centres (never in the half
// texel at the edge, where the sampler reads past the tile): a crossing of the tile's edge then moves by one texel, not by a crack
float noise(float2 p) { return tex2Dlod(Noise, float4(frac(p / 64.0) * (511.0 / 512.0) + 0.5 / 512.0, 0.0, 0.0)).r * 2.0 - 1.0; }

float fbm(float2 p)
{
    float s = 0.0, a = 0.5;
    [unroll] for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 1.9 + float2(1.7, 9.2); a *= 0.42; }
    return s * 1.6;
}

float form(float2 p, float t)
{
    float2 q = float2(fbm(p + float2(0.0, t)), fbm(p + float2(5.2, 1.3) - t * 0.7));
    float2 r = float2(fbm(p + 1.5 * q + float2(1.7, 9.2) + t * 0.5), fbm(p + 1.5 * q + float2(8.3, 2.8) - t * 0.4));
    return fbm(p + 1.3 * r);
}

float3 thermal(float v)
{
    float3 violet = lerp(float3(0.42, 0.25, 0.90), Acc.rgb, 0.55);
    float3 c = float3(0.006, 0.008, 0.016);
    c = lerp(c, float3(0.02, 0.10, 0.075), smoothstep(0.16, 0.34, v));
    c = lerp(c, violet, smoothstep(0.34, 0.50, v));
    c = lerp(c, float3(1.0, 0.33, 0.66), smoothstep(0.52, 0.64, v));
    c = lerp(c, float3(1.0, 0.56, 0.30), smoothstep(0.64, 0.76, v));
    c = lerp(c, float3(1.0, 0.82, 0.66), smoothstep(0.76, 0.88, v));
    c = lerp(c, float3(1.0, 0.97, 0.92), smoothstep(0.88, 1.0, v));
    return c;
}

float4 main(float2 uv : TEXCOORD) : COLOR
{
    float4 over = tex2D(Input, uv);
    float2 asp = float2(Res.x / Res.y, 1.0);
    float2 pos = uv * asp;

    // heating up: what shows, and the burning edge
    float2 rv = float2(1.0, 0.0);
    if (Reveal.y > 0.5)
    {
        float d = length(pos - Aura.xy * asp);
        float n = fbm(pos * 2.4 + float2(0.0, Clock.y * 0.2)) * 0.55 + fbm(pos * 7.0 - Clock.y * 0.3) * 0.18;
        float e = lerp(-0.4, 1.3, Reveal.x) - (d * 0.6 + n);
        float edge = exp(-e * e / 0.003);
        rv = float2(max(smoothstep(0.0, 0.035, e), edge * 0.9), edge);
    }

    float2 disp = float2(0.0, 0.0);
    float heat = rv.y * 1.25;
    [loop] for (int k = 0; k < 12; k++)
    {
        float4 w = Waves[k];
        if (w.w > 0.0)
        {
            float2 d = pos - w.xy * asp;
            float dist = length(d);
            float R = w.z * 0.42;
            float fade = w.w * max(0.0, 1.0 - R / 1.9);
            float x = dist - R;
            heat += exp(-x * x / 0.004) * fade + (x < 0.0 ? exp(x * 6.0) * 0.18 * fade : 0.0);
            disp += (d / max(dist, 1e-4)) * exp(-x * x / 0.01) * 0.05 * fade * Clock.w;
        }
    }

    float t = Clock.x * 0.05;
    float2 p = (pos + disp) * float2(0.62, 0.5);
    float2 a = Aura.xy * asp;
    float da = length((pos - a) * float2(0.7, 1.0));
    float mask = exp(-da * da * 1.7) * (0.3 + 0.7 * smoothstep(0.08, 0.5, uv.x));
    float m0 = 0.5 + (Clock.z - 0.5) * 0.35;
    float2 off = float2(0.009, 0.003);
    float mR = saturate(mask * (m0 + form(p + off, t) * 1.55) - 0.14 + heat * 0.45);
    float mG = saturate(mask * (m0 + form(p, t) * 1.55) - 0.14 + heat * 0.45);
    float mB = saturate(mask * (m0 + form(p - off, t) * 1.55) - 0.14 + heat * 0.45);
    float3 col = float3(thermal(mR).r, thermal(mG).g, thermal(mB).b);
    col += float3(1.0, 0.3, 0.7) * exp(-pow((mG - 0.53) / 0.02, 2.0)) * 0.35;
    float vig = smoothstep(1.35, 0.35, length((uv - float2(0.62, 0.55)) * float2(1.0, 1.2)));
    col *= lerp(0.35, 1.0, vig);

    float4 picture = float4(col * rv.x, rv.x);
    return (over + picture * (1.0 - over.a)) * Res.z;   // as strong as the player wants (the element's own opacity does not reach a shader's picture)
}
