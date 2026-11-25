import unittest
from apd_school_catalog_import import compile_index
ID="00000000-0000-4000-8000-000000000001"
HEADER="clave,establecimiento_nombre,munipio_nombre,nivel,desfavorabilidad,ámbito,periodo,email,matricula\n"
def build(lines):
    return compile_index((HEADER+lines).encode(),resource_id=ID,catalog_modified="2026-11-18")
class SchoolCatalog(unittest.TestCase):
    def test_minimal_index(self):
        r=build('0005MS0004,"Escuela, prueba",Avellaneda,Secundaria,0,Urbano,2026,private@example.invalid,500\n')
        self.assertEqual(r["schools"][0]["classification"],"0")
        self.assertEqual(r["schools"][0]["name"],"Escuela, prueba")
        self.assertNotIn("email",r["schools"][0])
        self.assertNotIn("matricula",r["schools"][0])
        self.assertEqual(len(r["sha256"]),64)
    def test_missing_is_not_zero(self):
        r=build("0005MS0004,Escuela,Avellaneda,Secundaria,,Rural,2026,,\n")
        self.assertIsNone(r["schools"][0]["classification"])
        self.assertEqual(r["counts"]["missing_classification"],1)
    def test_conflicting_identity_is_excluded(self):
        r=build("0005MS0004,Escuela,Avellaneda,Secundaria,1,Urbano,2026,,\n0005MS0004,Escuela,Avellaneda,Secundaria,2,Urbano,2026,,\n0005MS0005,Otra,Avellaneda,Secundaria,0,Urbano,2026,,\n")
        self.assertEqual([x["schoolKey"] for x in r["schools"]],["0005MS0005"])
        self.assertEqual(r["counts"]["ambiguous_keys"],1)
    def test_reject_bad_schema(self):
        with self.assertRaises(ValueError):
            compile_index(b"key,value\na,b",resource_id=ID,catalog_modified="2026-11-18")
    def test_bad_encoding(self):
        with self.assertRaises(UnicodeDecodeError):
            compile_index(b"\xff",resource_id=ID,catalog_modified="2026-11-18")
if __name__=="__main__":
    unittest.main()
