# Reference implementation of the Earth Impact Effects Program scaling equations.
# Collins, Melosh & Marcus (2005), Meteoritics & Planetary Science 40:817-840,
# doi:10.1111/j.1945-5100.2005.tb00157.x. Open PDF: https://impact.ese.ic.ac.uk/static/effects.pdf
#
# Purpose: a validated oracle for the eventual TypeScript port (Phase 0.4 in docs/plan/roadmap.md).
# Run `python3 scripts/eiep_reference.py` - the first two blocks reproduce the paper's Table 6.
# Known deviations (see docs/research/impact-event.md section 6): ejecta thickness and air-blast
# overpressure at Chicxulub scale differ from the paper's own table by up to ~2x (undocumented
# program details); eq. 41c's printed constant 6.399 vs 3.399 is flagged in the docs.
# Written by a research agent on 2026-10-11; not yet independently reviewed.

"""Re-implementation of the Earth Impact Effects Program scaling equations
(Collins, Melosh & Marcus 2005, Meteoritics & Planetary Science 40:817-840).
Equation numbers refer to that paper. SI units unless noted.
"""
import math

G = 9.81
RE = 6.371e6
SIGMA = 5.67e-8
T_STAR = 3000.0      # transparency temperature (K)
ETA = 3e-3           # luminous efficiency
P0 = 1e5             # ambient pressure (Pa)
C0 = 330.0           # sound speed (m/s)
MT = 4.18e15         # J per megaton TNT
KT = 4.18e12
D_C = 3.2            # simple->complex transition diameter on Earth (km)

IGNITION_1MT = {  # Table 1, MJ/m^2 for 1 Mt
    "clothing": 1.0, "plywood": 0.67, "grass": 0.38, "newspaper": 0.33,
    "deciduous trees": 0.25, "3rd-degree burns": 0.42,
    "2nd-degree burns": 0.25, "1st-degree burns": 0.13,
}


def crater(L, rho_i, v, theta_deg, rho_t):
    th = math.radians(theta_deg)
    E = math.pi / 12 * rho_i * L**3 * v**2                       # eq 1
    Dtc = 1.161 * (rho_i / rho_t)**(1/3) * L**0.78 * v**0.44 * G**-0.22 * math.sin(th)**(1/3)  # eq 21
    dtc = Dtc / (2 * math.sqrt(2))                               # eq 25
    Dtc_km = Dtc / 1e3
    if Dtc_km > 2.56:
        Dfr_km = 1.17 * Dtc_km**1.13 / D_C**0.13                 # eq 27
        dfr_km = 0.4 * Dfr_km**0.3                               # eq 28
    else:
        Dfr_km = 1.25 * Dtc_km
        dfr_km = float('nan')
    Vm = 8.9e-12 * E * math.sin(th)                              # eq 30
    Rf = 0.002 * E**(1/3)                                        # eq 32
    Tt = Rf / v                                                  # eq 33
    tau = ETA * E / (2 * math.pi * Rf**2 * SIGMA * T_STAR**4)    # eq 35
    M = 0.67 * math.log10(E) - 5.87                              # eq 40
    return dict(E=E, E_Mt=E / MT, Dtc_km=Dtc_km, dtc_km=dtc / 1e3, Dfr_km=Dfr_km,
                dfr_km=dfr_km, Vm_km3=Vm / 1e9, Rf_km=Rf / 1e3, Tt_s=Tt, tau_s=tau, M=M)


def at_distance(c, r_km, v, theta_deg):
    r = r_km * 1e3
    E = c["E"]
    out = {"r_km": r_km}
    # --- thermal (eqs 34, 36, 37) ---
    Delta = r / RE
    Rf = c["Rf_km"] * 1e3
    h = (1 - math.cos(Delta)) * RE
    if h >= Rf:
        f = 0.0
    else:
        delta = math.acos(h / Rf)
        f = (2 / math.pi) * (delta - (h / Rf) * math.sin(delta))
    Phi = ETA * E / (2 * math.pi * r**2) * f
    out["thermal_MJ_m2"] = Phi / 1e6
    out["thermal_kW_m2"] = Phi / c["tau_s"] / 1e3
    out["T_thermal_s"] = c["Tt_s"]
    out["fireball_visible"] = f > 0
    scale = (c["E_Mt"])**(1/6)
    out["ignites"] = [k for k, val in IGNITION_1MT.items() if Phi / 1e6 >= val * scale]
    # --- seismic (eqs 41, 42) ---
    M = c["M"]
    if r_km < 60:
        Meff = M - 0.0238 * r_km
    elif r_km < 700:
        Meff = M - 0.0048 * r_km - 1.1644
    else:
        Meff = M - 1.66 * math.log10(math.degrees(Delta)) - 6.399
    out["M_eff"] = Meff
    out["T_seismic_s"] = r_km / 5
    # --- ejecta (eqs 47, 49-53) ---
    Dtc = c["Dtc_km"] * 1e3
    out["ejecta_thickness_m"] = Dtc**4 / (112 * r**3)
    t2 = math.tan(Delta / 2)
    ve2 = 2 * G * RE * t2 / (1 + t2)                              # eq 52
    e2 = 0.5 * ((ve2 / (G * RE) - 1)**2 + 1)                     # eq 50
    e = math.sqrt(e2)
    if ve2 / (G * RE) <= 1:   # paper: "e is negative when v_e^2/(g R_E) <= 1"
        e = -e
    a = ve2 / (2 * G * (1 - e2))                                 # eq 51
    Te = (2 * a**1.5 / math.sqrt(G * RE**2)) * (
        2 * math.atan(math.sqrt((1 - e) / (1 + e)) * math.tan(Delta / 4))
        - (e * math.sqrt(1 - e2) * math.sin(Delta / 2)) / (1 + e * math.cos(Delta / 2)))  # eq 49
    out["T_ejecta_s"] = Te
    out["ejecta_velocity_km_s"] = math.sqrt(ve2) / 1e3
    Dfr = c["Dfr_km"]
    if r_km > Dfr:  # only outside ~2 crater radii
        dc = 2400 * (Dfr / 2)**-1.62
        out["mean_fragment_m"] = dc * (Dfr / (2 * r_km))**2.65  # eq 53
    # --- air blast (eqs 54, 57, 59, 64) ---
    E_kt = E / KT
    r1 = r / E_kt**(1/3)                                         # eq 57
    px, rx = 75000.0, 290.0
    p = (px * rx / (4 * r1)) * (1 + 3 * (rx / r1)**1.3)          # eq 54
    out["overpressure_bar"] = p / 1e5
    out["wind_m_s"] = (5 * p / (7 * P0)) * C0 / math.sqrt(1 + 6 * p / (7 * P0))  # eq 59
    out["T_blast_s"] = r / C0                                    # eq 64
    return out


def report(label, L_km, rho_i, v_kms, theta, rho_t, dists):
    c = crater(L_km * 1e3, rho_i, v_kms * 1e3, theta, rho_t)
    print(f"\n=== {label}: L={L_km} km, rho_i={rho_i}, v={v_kms} km/s, theta={theta} deg, rho_t={rho_t} ===")
    print(f"E = {c['E']:.3g} J = {c['E_Mt']:.3g} Mt TNT")
    print(f"Transient crater D_tc = {c['Dtc_km']:.1f} km, depth d_tc = {c['dtc_km']:.1f} km")
    print(f"Final crater D_fr = {c['Dfr_km']:.0f} km, rim-to-floor depth d_fr = {c['dfr_km']:.2f} km")
    print(f"Melt volume = {c['Vm_km3']:.0f} km^3; fireball radius R_f* = {c['Rf_km']:.0f} km; "
          f"time to max radiation = {c['Tt_s']:.1f} s; irradiation duration = {c['tau_s']:.0f} s")
    print(f"Seismic magnitude M = {c['M']:.2f}")
    entry = 100e3 / (v_kms * 1e3 * math.sin(math.radians(theta)))
    print(f"Atmospheric traverse from 100 km altitude at {theta} deg: {entry:.1f} s (derived, straight-line, no deceleration)")
    hdr = ("r(km)", "therm MJ/m2", "kW/m2", "vis", "ignites(trees?)", "Meff", "Ts(s)", "ej thk(m)", "Te(s)",
           "frag(m)", "dP(bar)", "wind m/s", "Tb(s)")
    print(" | ".join(hdr))
    for d in dists:
        o = at_distance(c, d, v_kms * 1e3, theta)
        ig = "trees" if "deciduous trees" in o["ignites"] else ("-" if not o["ignites"] else "partial")
        frag = o.get("mean_fragment_m", float('nan'))
        print(f"{d:>6} | {o['thermal_MJ_m2']:>10.3g} | {o['thermal_kW_m2']:>7.3g} | {str(o['fireball_visible'])[0]} | {ig:<8} | "
              f"{o['M_eff']:>5.1f} | {o['T_seismic_s']:>6.0f} | {o['ejecta_thickness_m']:>9.3g} | "
              f"{o['T_ejecta_s']:>6.0f} | {frag:>8.3g} | "
              f"{o['overpressure_bar']:>8.3g} | {o['wind_m_s']:>8.3g} | {o['T_blast_s']:>6.0f}")


if __name__ == "__main__":
    dists = [50, 100, 200, 500, 1000, 1500, 2000, 3000, 5000, 7500, 10000]
    # Validation case = Collins et al. 2005 Table 6, column 3 (18 km stony, 20 km/s, 45 deg, crystalline)
    report("VALIDATION Table 6 (expect E=1.65e24 J, Dfr=186 km, Rf=236 km, M=10.4; at 200 km: 137 m ejecta, 77 bar, 2220 m/s, Te=206 s, Tb=606 s)",
           18, 2700, 20, 45, 2750, [200])
    report("VALIDATION Table 6 col 2 (expect E=1.5e21 J, Dfr=23.7 km, Rf=23 km, M=8.3; at 200 km: 14.8 MJ/m2, 0.09 m ejecta, 2.4 cm frag, 0.80 bar, 145 m/s, Te=206 s)",
           1.75, 2700, 20, 45, 2750, [200])
    for E in (1e23, 3e23, 1e24):
        print(f"M(E={E:.0e} J) = {0.67*math.log10(E)-5.87:.2f}")
    # Chicxulub reference cases
    report("Chicxulub A: 12 km C-type (2650), 20 km/s, 60 deg, sedimentary", 12, 2650, 20, 60, 2500, dists)
    report("Chicxulub B: 14 km (Impact Earth / Range 2022 template), 2650, 20 km/s, 60 deg, sedimentary", 14, 2650, 20, 60, 2500, dists)
    report("Chicxulub C: Collins 2020 hydrocode input 17 km, 2630, 12 km/s, 60 deg, sedimentary", 17, 2630, 12, 60, 2500, dists)
    report("Chicxulub D: 10 km, 3000, 20 km/s, 45 deg, sedimentary (Alvarez-style)", 10, 3000, 20, 45, 2500, [200, 1000, 3000])
