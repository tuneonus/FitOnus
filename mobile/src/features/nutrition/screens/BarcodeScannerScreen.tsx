import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Flashlight, Keyboard, X } from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { useTheme } from '@/hooks/use-theme';
import { nutritionApi } from '../api/nutrition-api';
import type { FoodItem, MealType } from '../types/nutrition';
import { logger } from '@/utils/logger';

export function BarcodeScannerScreen() {
  const { colors } = useTheme();
  const { goBack, replace } = useNavigation();
  const params = useRouteParams<{ meal?: MealType }>();
  const meal = params.meal ?? 'snacks';

  const [permission, requestPermission] = useCameraPermissions();
  const lastScannedCode = useRef<string | null>(null);
  const scanTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [found, setFound] = useState(false);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [product, setProduct] = useState<FoodItem | null>(null);

  // Scan line animation
  const [scanAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    ).start();

    return () => {
      if (scanTimeout.current) clearTimeout(scanTimeout.current);
    };
  }, [scanAnim]);

  const lookupCode = async (targetCode: string) => {
    const clean = targetCode.trim();
    if (clean.length < 6) {
      setNotFound(true);
      return;
    }

    setLookingUp(true);
    try {
      const item = await nutritionApi.getFoodByBarcode(clean);
      setProduct(item);
      setManual(false);
      setFound(true);
      setNotFound(false);
    } catch (err: any) {
      logger.warn('Barcode lookup failed on backend:', err?.message);
      setNotFound(true);
    } finally {
      setLookingUp(false);
    }
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (found || lookingUp || !data) return;
    if (lastScannedCode.current === data) return;
    lastScannedCode.current = data;
    setCode(data);
    void lookupCode(data);
    if (scanTimeout.current) clearTimeout(scanTimeout.current);
    scanTimeout.current = setTimeout(() => {
      lastScannedCode.current = null;
    }, 3000);
  };

  const lookup = () => lookupCode(code);

  const translateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 150],
  });

  return (
    <SafeAreaView style={styles.container}>
      {permission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torchOn}
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr', 'code128', 'code39'],
          }}
          onBarcodeScanned={found ? undefined : handleBarcodeScanned}
        />
      ) : null}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={goBack}
          style={styles.iconCircle}
          accessibilityLabel="Close scanner"
        >
          <X size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan barcode</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setTorchOn(!torchOn)}
          style={[styles.iconCircle, torchOn && { backgroundColor: 'rgba(255,255,255,0.35)' }]}
          accessibilityLabel="Toggle flashlight"
        >
          <Flashlight size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Viewfinder */}
      <View style={styles.viewfinderContainer}>
        {!permission?.granted ? (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>Camera access is needed to scan food barcodes.</Text>
            <Button
              title="Grant Camera Access"
              size="sm"
              onPress={requestPermission}
              style={{ marginTop: 12 }}
            />
          </View>
        ) : (
          <View style={styles.frame}>
            {!found && (
              <Animated.View
                style={[
                  styles.scanLine,
                  {
                    transform: [{ translateY }],
                    backgroundColor: colors.accent,
                  },
                ]}
              />
            )}
          </View>
        )}
        <Text style={styles.statusText}>
          {found
            ? 'Barcode detected'
            : lookingUp
            ? 'Looking up barcode…'
            : 'Line up the barcode inside the frame'}
        </Text>
      </View>

      {/* Manual Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setManual(true)}
          style={styles.manualBtn}
        >
          <Keyboard size={18} color="#FFFFFF" />
          <Text style={styles.manualText}>Enter barcode manually</Text>
        </TouchableOpacity>
      </View>

      {/* Found Product Sheet */}
      {product && (
        <BottomSheet
          open={found}
          onClose={() => setFound(false)}
          title={product.name}
          description={`${product.brand ? `${product.brand} · ` : ''}${product.serving}`}
          footer={
            <Button
              size="lg"
              fullWidth
              onPress={() =>
                replace('foodDetail', { id: product.id, meal, source: 'barcode' })
              }
            >
              Review & add
            </Button>
          }
        >
          <View style={[styles.productGrid, { backgroundColor: colors.surface2 }]}>
            {[
              ['kcal', product.kcal],
              ['Protein', `${product.protein}g`],
              ['Carbs', `${product.carbs}g`],
              ['Fat', `${product.fat}g`],
            ].map(([label, val]) => (
              <View key={String(label)} style={styles.gridItem}>
                <Text style={[styles.gridLabel, { color: colors.muted }]}>{label}</Text>
                <Text style={[styles.gridVal, { color: colors.ink }]}>{val}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.gridFootnote, { color: colors.muted }]}>
            Values from authoritative food catalog.
          </Text>
        </BottomSheet>
      )}

      {/* Manual Entry Sheet */}
      <BottomSheet
        open={manual}
        onClose={() => setManual(false)}
        title="Enter barcode"
        footer={
          <Button size="lg" fullWidth onPress={lookup} disabled={lookingUp}>
            {lookingUp ? 'Looking up...' : 'Look up'}
          </Button>
        }
      >
        <TextField
          label="Barcode number"
          keyboardType="numeric"
          placeholder="e.g. 012345678901"
          value={code}
          onChangeText={(t) => {
            setCode(t.replace(/\D/g, ''));
            setNotFound(false);
          }}
          error={
            notFound
              ? 'We couldn’t find that barcode. Check the number or search by name.'
              : undefined
          }
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  frame: {
    width: 260,
    height: 180,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 24,
  },
  permissionBox: {
    width: 260,
    padding: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    marginBottom: 24,
  },
  permissionText: {
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 20,
  },
  scanLine: {
    height: 2,
    width: '100%',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 6,
    textAlign: 'center',
  },
  subText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
  },
  bottomBar: {
    padding: 24,
    alignItems: 'center',
  },
  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  manualText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  productGrid: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 16,
    marginVertical: 12,
  },
  gridItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  gridLabel: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  gridVal: {
    fontSize: 16,
    fontWeight: '700',
  },
  gridFootnote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
});
